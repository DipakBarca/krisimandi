import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import { config } from '../config';
import { forbidden } from '../common/errors';
import { PrismaService } from '../prisma.service';

const PUBLIC = 'isPublic';
const ROLES = 'roles';

/** Route is open to guests; a signed-in user is still attached when a token is sent. */
export const Public = () => SetMetadata(PUBLIC, true);
/** Route needs at least one of these roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): User | undefined => ctx.switchToHttp().getRequest().user,
);

/** Global guard: checks the bearer token, loads the user, then applies @Public and @Roles. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC, targets);
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES, targets);
    const req = ctx.switchToHttp().getRequest();

    const header: string | undefined = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (token) {
      try {
        const { sub } = await this.jwt.verifyAsync<{ sub: string }>(token, { secret: config.jwtSecret });
        const user = await this.prisma.user.findUnique({ where: { id: sub } });
        if (user && !user.isSuspended) req.user = user;
      } catch {
        // Invalid or expired token: treated as signed out below.
      }
    }

    if (!req.user) {
      if (isPublic) return true;
      throw new UnauthorizedException();
    }
    if (roles?.length && !roles.some((r) => req.user.roles.includes(r))) {
      throw forbidden('ROLE_REQUIRED', `This needs the ${roles.join(' or ')} role.`);
    }
    return true;
  }
}
