import { Body, Controller, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { loginRequestSchema } from '@qqe/shared';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(201)
  async login(@Body() body: unknown) {
    const parsed = loginRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new UnauthorizedException('Invalid credentials');
    }
    try {
      return await this.authService.login(parsed.data);
    } catch {
      throw new UnauthorizedException('Invalid credentials');
    }
  }
}