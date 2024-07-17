import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';
import { AbstractRepository } from 'lib/commons/src/database/abstract.repository';
import { Message } from 'user/src/models/message.model';

@Injectable()
export class ChatService extends AbstractRepository<Message> {
  protected logger: Logger;
  constructor(
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
  ) {
    super(messageRepository);
  }

  async getMessages(sender: string, recipient: string): Promise<Message[]> {
    return await this.messageRepository.find({
      where: [
        { sender, recipient },
        { sender: recipient, recipient: sender }
      ],
      order: { timestamp: 'ASC' }
    });
  }
}

