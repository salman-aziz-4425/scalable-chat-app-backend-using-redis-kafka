import { Body, Controller, Get, Post, UsePipes } from '@nestjs/common';
import { UserService } from './user.service';
import { User } from './models/user.model';

import { ZodValidationPipe } from './pipes/validation.pipe';
import { RegisterDto, UserRegisterSchema } from './dto/register.dto';

@Controller("user")
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('login')
  async login(@Body('email') email: string, @Body('password') password: string) {
    console.log("logging in")
    const accessToken = await this.userService.login({email, password});
    return { ...accessToken};
  }

  @Post("register")
  @UsePipes(new ZodValidationPipe(UserRegisterSchema))
  async register(@Body() registerDto: RegisterDto): Promise<User> {
    return this.userService.register(registerDto);
  }
  @Post("find")
  async findUser(@Body('email') email:string): Promise<User> {
    return this.userService.findByEmail(email);
  }

  @Get("allUsers")
  async getAllUser(): Promise<{id:Number,email:string}[]> {
    return this.userService.findAllUsers();
  }
}
