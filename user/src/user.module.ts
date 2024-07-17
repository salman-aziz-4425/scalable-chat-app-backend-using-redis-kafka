import { Module } from '@nestjs/common';

import { AuthModule } from 'lib/commons/src/auth/src/auth.module';
import { DatabaseModule } from 'lib/commons/src/database/database.module';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { User } from './models/user.model';
import { Message } from './models/message.model';


@Module({
  imports: [DatabaseModule,DatabaseModule.forfeature([User,Message]),AuthModule],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}
