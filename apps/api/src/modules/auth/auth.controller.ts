import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import {
  DemoLoginInput,
  DemoLoginSchema,
  JwtPayload,
  LoginInput,
  LoginSchema,
  RegisterInput,
  RegisterSchema,
} from '@crosspilot/shared';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  async login(@Body() body: LoginInput) {
    const validated = LoginSchema.parse(body);
    return this.authService.login(validated);
  }

  @Public()
  @Post('demo-login')
  async demoLogin(@Body() body: DemoLoginInput = { role: 'OWNER' }) {
    const validated = DemoLoginSchema.parse(body);
    return this.authService.demoLogin(validated.role);
  }

  @Public()
  @Post('register')
  async register(@Body() body: RegisterInput) {
    const validated = RegisterSchema.parse(body);
    return this.authService.register(validated);
  }

  @Get('me')
  async getProfile(@CurrentUser() user: JwtPayload) {
    return this.authService.getProfile(user.sub);
  }
}
