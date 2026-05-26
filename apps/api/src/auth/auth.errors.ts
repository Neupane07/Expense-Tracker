import { ForbiddenException } from '@nestjs/common';

export class InviteRequiredException extends ForbiddenException {
  constructor() {
    super('An unused invitation is required.');
  }
}
