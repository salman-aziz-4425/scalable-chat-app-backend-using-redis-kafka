import { SubscribeMessage, WebSocketGateway, WebSocketServer, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import Redis from 'ioredis';

const pub = new Redis({
  host: 'caching-20be2dee-salmanaziz216-1f0e.i.aivencloud.com',
  port: 26013,
  username: 'default',
  password: 'AVNS_IcLsIPseyFo2wITlXJ7',
});

const sub = new Redis({
  host: 'caching-20be2dee-salmanaziz216-1f0e.i.aivencloud.com',
  port: 26013,
  username: 'default',
  password: 'AVNS_IcLsIPseyFo2wITlXJ7',
});

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

  constructor() {
    sub.subscribe('user_online', 'user_offline', 'send_message');
    sub.on('message', (channel, message) => {
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

    if (!this.connectedUsers.has(payload.email)) {
      this.connectedUsers.set(payload.email, [client.id]);
    } else {
      const socketIds = this.connectedUsers.get(payload.email);
      if (socketIds && !socketIds.includes(client.id)) {
        socketIds.push(client.id);
        this.connectedUsers.set(payload.email, socketIds);
      }
    }

    pub.publish('user_online', JSON.stringify(payload));
    this.broadcastActiveUsers();
  }

  @SubscribeMessage('user_offline')
  handleUserOffline(client: Socket, payload: { email: string }): void {
    console.log(`${payload.email} is offline`);
    this.removeSocketIdFromEmail(client.id);
    pub.publish('user_offline', JSON.stringify(payload));
    this.broadcastActiveUsers();
  }

  @SubscribeMessage('send_message')
  handleMessage(client: Socket, payload: { sender: string, recipient: string, message: string }): void {
    const { sender, recipient, message } = payload;
    const messageObject = { id: new Date().getTime(), sender, recipient, message,clientId:client.id};
    pub.publish('send_message', JSON.stringify(messageObject));
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

  private handleUserOnlineRedis(payload: { email: string }): void {
    if (!this.connectedUsers.has(payload.email)) {
      this.connectedUsers.set(payload.email, []);
    }
    this.broadcastActiveUsers();
  }

  private handleUserOfflineRedis(payload: { email: string }): void {
    if (this.connectedUsers.has(payload.email)) {
      this.connectedUsers.delete(payload.email);
    }
    this.broadcastActiveUsers();
  }

  private handleMessageRedis(payload: { id: number, sender: string, recipient: string, message: string,clientId:string }): void {
    const { sender, recipient, message,clientId } = payload;
    const recipientSocketIds = this.getSocketIdsByEmail(recipient);
    const senderSocketIds = this.getSocketIdsByEmail(sender);
    const recipients = recipientSocketIds ? [...recipientSocketIds, ...senderSocketIds] : [];

    console.log(clientId)

    if (recipients && recipients.length > 0) {
      recipients.forEach(socketId => {
        if(socketId!==clientId){
          this.server.to(socketId).emit('receive_message', payload);
        }
      });
    }
  }
}
