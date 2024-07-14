import { SubscribeMessage, WebSocketGateway, WebSocketServer, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private connectedUsers: Map<string, string> = new Map();

  afterInit(server: Server) {
    console.log('WebSocket Gateway Initialized');
  }

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    const userEmail = this.connectedUsers.get(client.id);
    if (userEmail) {
      this.connectedUsers.delete(client.id);
      this.broadcastActiveUsers();
    }
  }

  @SubscribeMessage('user_online')
  handleUserOnline(client: Socket, payload: { email: string }): void {
    console.log(`${payload.email} is online`);
    if (!this.connectedUsers.has(payload.email)) {
      this.connectedUsers.set(payload.email, client.id);
      this.broadcastActiveUsers();
    } else {
      console.log(`${payload.email} is already registered`);
    }
  }

  @SubscribeMessage('user_offline')
  handleUserOffline(client: Socket, payload: { email: string }): void {
    console.log(`${payload.email} is offline`);
    if (this.connectedUsers.has(payload.email)) {
      this.connectedUsers.delete(payload.email);
      this.broadcastActiveUsers();
    } else {
      console.log(`${payload.email} was not registered`);
    }
  }

  @SubscribeMessage('send_message')
  handleMessage(client: Socket, payload: { sender: string, recipient: string, message: string }): void {
    const { sender, recipient, message } = payload;
    const messageObject = { id: new Date().getTime(), sender,recipient, message };
    const recipientSocketId = this.connectedUsers.get(recipient);
    console.log("helo")
    console.log(recipient)
    if (recipientSocketId) {
      this.server.to(recipientSocketId).emit('receive_message', messageObject);
      console.log(`Sent message to ${recipient}: ${message}`);
    } else {
      console.log(`Recipient ${recipient} is not online`);
    }
  }
  private broadcastActiveUsers(): void {
    console.log(this.connectedUsers)
    const activeUsersSet = new Set(this.connectedUsers.keys());
    const activeUsers = Array.from(activeUsersSet);
    console.log('Broadcasting active users:', activeUsers);
    this.server.emit('active_user', activeUsers);
  }

}
