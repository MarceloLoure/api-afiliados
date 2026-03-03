import { Injectable, UnauthorizedException } from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from 'src/prisma/prisma.service'
import { UserResponseDto } from 'src/users/dto/user-response.dto'

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(email: string, password: string) {
    const hashedPassword = await bcrypt.hash(password, 10)

    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: 'ADMIN',
      },
    })

    return {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt
    }
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } })

    if (!user) throw new UnauthorizedException('Invalid credentials')

    const isMatch = await bcrypt.compare(password, user.password)

    if (!isMatch) throw new UnauthorizedException('Invalid credentials')

    return user
  }

  async login(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    }

    return {
      access_token: this.jwtService.sign(payload),
    }
  }
}