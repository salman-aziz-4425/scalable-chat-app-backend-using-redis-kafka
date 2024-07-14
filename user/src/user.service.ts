import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs'; // Import bcryptjs for password hashing

import { Repository } from 'typeorm';

import { AuthService } from 'lib/commons/src/auth/src/auth.service';
import { AbstractRepository } from 'lib/commons/src/database/abstract.repository';

import { User } from './models/user.model';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class UserService extends AbstractRepository<User> {
  protected logger: Logger;
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly authService: AuthService
  ) {
    super(userRepository);
  }

  async login(userDTO: RegisterDto):Promise<any>{ 
    const { email, password } = userDTO;
    try{
      const user=await this.findOne({ where: { email } })
      if(!user){
         throw new BadRequestException('User not found')
      }
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        throw new BadRequestException('Invalid credentials');
      }
      const userData=await this.authService.login(email)
      return userData
    }catch(error){
      throw new BadRequestException('Failed to login user', error?.message);
    }
  }

  async register(registerDto: RegisterDto): Promise<User> {
    try {
      const { email, password } = registerDto;
      const hashedPassword = await bcrypt.hash(password, 10);
      return await this.create({
        email,
        password: hashedPassword,
      });
    } catch (error) {
      throw new BadRequestException('Failed to register user', error.message);
    }
  }

  async findByEmail(email: string): Promise<User | undefined> {
    try {
      return await this.findOne({ where: { email } });
    } catch (error) {
      throw new BadRequestException('Failed to find user by email', error.message);
    }
  }

  async findAllUsers(): Promise<User[] | undefined> {
    try {
      return await this.userRepository.find({select:["id","email"]});
    } catch (error) {
      throw new BadRequestException('Failed to find user by email', error.message);
    }
  }
}
