import {
  Controller,
  Post,
  Body,
  Headers,
  UnauthorizedException,
  Get,
  UseGuards,
  Req,
} from '@nestjs/common'
import { AuthService } from './auth.service'
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(
    @Body() body: { email: string; password: string },
    @Headers('x-admin-secret') secret: string,
  ) {
    if (secret !== process.env.ADMIN_SECRET) {
      throw new UnauthorizedException('Invalid admin secret')
    }

    return this.authService.register(body.email, body.password)
  }

  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
    const user = await this.authService.validateUser(
      body.email,
      body.password,
    )

    return this.authService.login(user)
  }

    @Get('me')
    @UseGuards(JwtAuthGuard)
    getProfile(@Req() req) {
        return req.user
    }
}