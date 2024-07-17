import { Controller, Get, Query } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('messages')
  async getMessages(
    @Query('sender') sender: string,
    @Query('recipient') recipient: string,
  ) {
    return await this.chatService.getMessages(sender, recipient);
  }
}
