import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JWTSecretKey } from 'lib/commons/src/constant';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  async login(email: string): Promise<{}> {
    const accessToken = this.jwtService.sign({ email: email},{privateKey:JWTSecretKey,expiresIn: '20m'},);
    const refreshToken = this.jwtService.sign({ email: email}, { privateKey: JWTSecretKey, expiresIn: '7d' });
    return { accessToken, refreshToken }
  }

  async validateUser(authorizationHeader: string): Promise<any> {

    if (!authorizationHeader.startsWith('Bearer ')) {
      throw new Error('Invalid authorization header format');
    }
    const token = authorizationHeader.split(' ')[1];
    
    const decoded = this.jwtService.verify(token,{publicKey:JWTSecretKey});
    const user = { email: decoded.email, id: decoded.sub };

    return user;
  }

  async refreshToken(oldRefreshToken: string): Promise<{ accessToken: string, refreshToken: string }> {
    try {
      const decoded = this.jwtService.verify(oldRefreshToken, { secret: JWTSecretKey });

      const newAccessToken = this.jwtService.sign({ sub: decoded.sub }, {
        secret: JWTSecretKey,
        expiresIn: '20m'
      });

      const newRefreshToken = this.jwtService.sign({ sub: decoded.sub }, {
        secret: JWTSecretKey,
        expiresIn: '7d'
      });
      return { accessToken: newAccessToken, refreshToken: newRefreshToken };
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }
}
