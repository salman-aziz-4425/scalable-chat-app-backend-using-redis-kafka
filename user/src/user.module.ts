import { Module } from '@nestjs/common';

import { AuthModule } from 'lib/commons/src/auth/src/auth.module';
import { DatabaseModule } from 'lib/commons/src/database/database.module';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { User } from './models/user.model';


@Module({
  imports: [DatabaseModule.forfeature([User]),AuthModule],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}
