import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Consumer, EachMessagePayload, Kafka, KafkaConfig, Producer } from 'kafkajs';
import { Repository } from 'typeorm';
import { Server, Socket } from 'socket.io';

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

  private pub: Redis;
  private sub: Redis;
  private producer: Producer;
  private consumer: Consumer;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
  ) {
    const redisInfo = {
      host: this.configService.get<string>('REDIS_DATABASE_HOST'),
      port: this.configService.get<number>('REDIS_DATABASE_PORT'),
      username: this.configService.get<string>('REDIS_DATABASE_USERNAME'),
      password: this.configService.get<string>('REDIS_DATABASE_PASSWORD'),
    };
    this.pub = new Redis(redisInfo);
    this.sub = new Redis(redisInfo);

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
    this.sub.subscribe('user_online', 'user_offline', 'send_message');
    this.sub.on('message', (channel, message) => {
      const payload = JSON.parse(message);
      switch (channel) {
        case 'user_online':
          this.handleUserOnlineRedis(payload);
          break;
        case 'user_offline':
          this.handleUserOfflineRedis(payload);
          break;
        case 'send_message':
          this.handleMessageRedis(payload);
          break;
      }
    });
    this.consumer.run({
      eachMessage: async ({ topic, partition, message, pause }: EachMessagePayload) => {
        const messageObject: any = JSON.parse(message.value as any);
        try {
          const timestamp = new Date();
          await this.messageRepository.insert({ sender: messageObject.sender, recipient: messageObject.recipient, message: messageObject.message, timestamp });
        } catch (error) {
          console.log(error);
          pause();
          setTimeout(() => { this.consumer.resume([{ topic: "chat-topic" }]); }, 60 * 10000);
        }
        console.log("data inserted");
      },
    });
  }

  afterInit(server: Server) {
    console.log('WebSocket Gateway Initialized');
  }

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    this.handleUserOffline(client);
  }

  @SubscribeMessage('user_online')
  handleUserOnline(client: Socket, payload: { email: string }): void {
    console.log(`${payload.email} is online`);
    this.pub.publish('user_online', JSON.stringify({ ...payload, id: client.id }));
  }

  @SubscribeMessage('user_offline')
  handleUserOffline(client: Socket, payload?: { email: string }): void {
    if (!payload) {
      this.removeSocketIdFromEmail(client.id);
      this.broadcastActiveUsers();
    } else {
      this.pub.publish('user_offline', JSON.stringify({ ...payload, id: client.id }));
    }
  }

  @SubscribeMessage('send_message')
  handleMessage(client: Socket, payload: { sender: string, recipient: string, message: string }): void {
    const { sender, recipient, message } = payload;
    const messageObject = { id: new Date().getTime(), sender, recipient, message, clientId: client.id };
    this.pub.publish('send_message', JSON.stringify(messageObject));
    this.producer.send({
      topic: 'chat-topic',
      messages: [{
        value: JSON.stringify({ ...messageObject }),
      }],
    });
  }

  private async handleUserOnlineRedis(payload: { email: string, id: string }): Promise<void> {
    await this.pub.sadd(`user_socket:${payload.email}`, payload.id);
    this.broadcastActiveUsers();
  }

  private async handleUserOfflineRedis(payload: { email: string, id: string }): Promise<void> {
    console.log(`${payload.email} is offline`);
    await this.pub.srem(`user_socket:${payload.email}`, payload.id);
    this.broadcastActiveUsers();
  }

  private async handleMessageRedis(payload: { id: number, sender: string, recipient: string, message: string, clientId: string }): Promise<void> {
    console.log("message");
    const { sender, recipient, clientId } = payload;
    const recipientSocketIds = await this.pub.smembers(`user_socket:${recipient}`);
    const senderSocketIds = await this.pub.smembers(`user_socket:${sender}`);
    const recipients = [...recipientSocketIds, ...senderSocketIds];

    if (recipients && recipients.length > 0) {
      recipients.forEach(socketId => {
        if (socketId !== clientId) {
          this.server.to(socketId).emit('receive_message', payload);
        }
      });
    }
  }

  private async broadcastActiveUsers(): Promise<void> {
    const keys = await this.pub.keys('user_socket:*');
    const activeUsers = keys.map(key => key.split(':')[1]);
    console.log('Users broadcasted');
    console.log(activeUsers);
    this.server.emit('active_user', activeUsers);
  }

  private async removeSocketIdFromEmail(socketId: string): Promise<void> {
    const keys = await this.pub.keys('user_socket:*');
    for (const key of keys) {
      const email = key.split(':')[1];
      const socketIds = await this.pub.smembers(key);
      if (socketIds.includes(socketId)) {
        await this.pub.srem(key, socketId);
        if ((await this.pub.scard(key)) === 0) {
          await this.pub.del(key);
        }
        break;
      }
    }
  }
}