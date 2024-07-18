import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Consumer, EachMessagePayload, Kafka, KafkaConfig, Producer } from 'kafkajs';
import { Repository } from 'typeorm';
import { Server, Socket } from 'socket.io';
import { createAdapter } from 'socket.io-redis';
import Redis from 'ioredis';

import { Message } from 'user/src/models/message.model';

@WebSocketGateway({
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private producer: Producer;
  private consumer: Consumer;
  private pubClient: Redis;
  private subClient: Redis;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>
  ) {
    const redisInfo = {
      host: this.configService.get<string>('REDIS_DATABASE_HOST'),
      port: this.configService.get<number>('REDIS_DATABASE_PORT'),
      username: this.configService.get<string>('REDIS_DATABASE_USERNAME'),
      password: this.configService.get<string>('REDIS_DATABASE_PASSWORD'),
    };

    this.pubClient = new Redis(redisInfo);
    this.subClient = new Redis(redisInfo);

    const kafkaConfig: KafkaConfig = {
      clientId: 'test-app',
      brokers: ['localhost:9092'],
    };
    const kafka = new Kafka(kafkaConfig);

    this.producer = kafka.producer();
    this.consumer = kafka.consumer({ groupId: 'test-group' });

    this.producer.connect();
    this.consumer.connect();

    this.consumer.subscribe({ topic: 'chat-topic', fromBeginning: true });
    this.consumer.run({
      eachMessage: async ({ topic, partition, message, pause }: EachMessagePayload) => {
        const messageObject: any = JSON.parse(message.value as any);
        try {
          const timestamp = new Date();
          await this.messageRepository.insert({ sender: messageObject.sender, recipient: messageObject.recipient, message: messageObject.message, timestamp });
          console.log("Data inserted");
        } catch (error) {
          console.error("Error inserting data", error);
          pause();
          setTimeout(() => { this.consumer.resume([{ topic: "chat-topic" }]) }, 60 * 1000);
        }
      },
    });
  }

  afterInit(server: Server) {
    server.adapter(createAdapter({ pubClient: this.pubClient, subClient: this.subClient }));
    console.log('WebSocket Gateway Initialized');
  }

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
    this.broadcastActiveUsers();
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    this.removeSocketIdFromEmail(client.id);
    this.broadcastActiveUsers();
  }

  @SubscribeMessage('user_online')
  handleUserOnline(client: Socket, payload: { email: string }): void {
    console.log(`${payload.email} is online with socket ID: ${client.id}`);
    this.handleUserOnlineRedis({ ...payload, id: client.id });
  }

  @SubscribeMessage('user_offline')
  handleUserOffline(client: Socket, payload: { email: string }): void {
    console.log(`${payload.email} is offline with socket ID: ${client.id}`);
    this.handleUserOfflineRedis({ ...payload, id: client.id });
  }

  @SubscribeMessage('send_message')
  async handleMessage(client: Socket, payload: { sender: string, recipient: string, message: string }): Promise<void> {
    const { sender, recipient, message } = payload;
    const messageObject = { id: new Date().getTime(), sender, recipient, message, clientId: client.id };

    const recipientSocketIds = await this.getSocketIdsByEmail(recipient);
    const senderSocketIds = await this.getSocketIdsByEmail(sender); 

    const recipients = [...new Set([...(recipientSocketIds || []), ...(senderSocketIds || [])])];
    
    console.log(`Recipients: ${recipients}`);
    
    if (recipients.length > 0) {
      recipients.forEach(socketId => {
        if (socketId !== client.id) {
          console.log(socketId)
          this.server.to(socketId).emit('receive_message', messageObject);
        }
      });
    }

    this.producer.send({
      topic: 'chat-topic',
      messages: [{
        value: JSON.stringify({ ...messageObject })
      }]
    });
  }

  private async broadcastActiveUsers(): Promise<void> {
    const keys = await this.pubClient.keys('user:*');
    const activeUsers = keys.map(key => key.split(':')[1]);
    console.log('Users broadcasted');
    console.log(activeUsers);
    this.server.emit('active_user', activeUsers);
  }

  private async getSocketIdsByEmail(email: string): Promise<string[] | undefined> {
    const socketIds = await this.pubClient.smembers(`user:${email}`);
    return socketIds.length > 0 ? socketIds : undefined;
  }

  private async removeSocketIdFromEmail(socketId: string): Promise<void> {
    const keys = await this.pubClient.keys('user:*');
    for (const key of keys) {
      const socketIds = await this.pubClient.smembers(key);
      if (socketIds.includes(socketId)) {
        await this.pubClient.srem(key, socketId);
        if ((await this.pubClient.scard(key)) === 0) {
          await this.pubClient.del(key);
        }
        break;
      }
    }
  }

  private async handleUserOnlineRedis(payload: { email: string, id: string }): Promise<void> {
    await this.pubClient.sadd(`user:${payload.email}`, payload.id);
    this.broadcastActiveUsers();
  }

  private async handleUserOfflineRedis(payload: { email: string, id: string }): Promise<void> {
    console.log(`${payload.email} is offline`);
    await this.pubClient.srem(`user:${payload.email}`, payload.id);
    const remainingSocketIds = await this.pubClient.smembers(`user:${payload.email}`);
    if (remainingSocketIds.length === 0) {
      await this.pubClient.del(`user:${payload.email}`);
    }
    this.broadcastActiveUsers();
  }
}
