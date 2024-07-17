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

  private connectedUsers: Map<string, string[]> = new Map();
  private pub: Redis;
  private sub: Redis;
  private producer:Producer;
  private cosumer: Consumer;

  constructor(private readonly configService: ConfigService,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>) {
    const redisInfo = {
      host: this.configService.get<string>('REDIS_DATABASE_HOST'),
      port: this.configService.get<number>('REDIS_DATABASE_PORT'),
      username: this.configService.get<string>('REDIS_DATABASE_USERNAME'),
      password: this.configService.get<string>('REDIS_DATABASE_PASSWORD'),
    }
    this.pub = new Redis(redisInfo);
    this.sub = new Redis(redisInfo);

    const kafkaConfig: KafkaConfig = {
      clientId: 'test-app',
      brokers: ['localhost:9092']
    }
    const kafka = new Kafka(kafkaConfig)

    this.producer = kafka.producer()
    this.cosumer = kafka.consumer({ groupId: 'test-group' })

    this.producer.connect()
    this.cosumer.connect()

    this.cosumer.subscribe({ topic: 'chat-topic', fromBeginning: true });
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
    this.cosumer.run({
      eachMessage: async ({ topic, partition, message, pause }:EachMessagePayload) => {
        const messageObject:any = JSON.parse(message.value as any)
        try {
          const timestamp = new Date();
          await this.messageRepository.insert({ sender: messageObject.sender, recipient: messageObject.recipient, message: messageObject.message, timestamp })
        } catch (error) {
          console.log(error)
          pause()
          setTimeout(() => { this.cosumer.resume([{ topic: "chat-topic" }]) }, 60 * 10000)
        }

        console.log("data inserted")
      },
    });
  }

  afterInit(server: Server) {
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
    console.log(`${payload.email} is online`);
    this.pub.publish('user_online', JSON.stringify({...payload,id:client.id}));
  }

  @SubscribeMessage('user_offline')
  handleUserOffline(client: Socket, payload: { email: string }): void {
    this.pub.publish('user_offline', JSON.stringify({...payload,id:client.id}));
  }

  @SubscribeMessage('send_message')
  handleMessage(client: Socket, payload: { sender: string, recipient: string, message: string }): void {
    const { sender, recipient, message } = payload;
    const messageObject = { id: new Date().getTime(), sender, recipient, message, clientId: client.id };
    this.pub.publish('send_message', JSON.stringify(messageObject));
    this.producer.send({
      topic: 'chat-topic',
      messages: [{
        value: JSON.stringify({ ...messageObject })
      }]
    })
  }

  private broadcastActiveUsers(): void {
    const activeUsers = Array.from(this.connectedUsers.keys());
    console.log('Users broadcasted');
    console.log(this.connectedUsers);
    console.log(activeUsers);
    this.server.emit('active_user', activeUsers);
  }

  private getSocketIdsByEmail(email: string): string[] | undefined {
    return this.connectedUsers.get(email);
  }

  private removeSocketIdFromEmail(socketId: string): void {
    for (const [email, socketIds] of this.connectedUsers.entries()) {
      const index = socketIds.indexOf(socketId);
      if (index !== -1) {
        socketIds.splice(index, 1);
        if (socketIds.length === 0) {
          this.connectedUsers.delete(email);
        } else {
          this.connectedUsers.set(email, socketIds);
        }
        break;
      }
    }
  }

  private handleUserOnlineRedis(payload: { email: string,id:string }): void {
    if (!this.connectedUsers.has(payload.email)) {
      this.connectedUsers.set(payload.email, [payload.id]);
    } else {
      const socketIds = this.connectedUsers.get(payload.email);
      if (socketIds && !socketIds.includes(payload.id)) {
        socketIds.push(payload.id);
        this.connectedUsers.set(payload.email, socketIds);
      }
    }
    this.broadcastActiveUsers();
  }

  private handleUserOfflineRedis(payload: { email: string ,id:string}): void {
    console.log(`${payload.email} is offline`);
    this.removeSocketIdFromEmail(payload.id);
    this.broadcastActiveUsers();
  }

  private handleMessageRedis(payload: { id: number, sender: string, recipient: string, message: string, clientId: string }): void {
    const { sender, recipient,clientId } = payload;
    const recipientSocketIds = this.getSocketIdsByEmail(recipient);
    const senderSocketIds = this.getSocketIdsByEmail(sender);
    const recipients = recipientSocketIds ? [...recipientSocketIds, ...senderSocketIds] : [];

    if (recipients && recipients.length > 0) {
      recipients.forEach(socketId => {
        if (socketId !== clientId) {
          this.server.to(socketId).emit('receive_message', payload);
        }
      });
    }
  }

}
