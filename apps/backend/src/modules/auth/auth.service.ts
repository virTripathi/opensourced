import { Injectable } from '@nestjs/common';
import { UserProfile } from '@worksmarter/common/types';

@Injectable()
export class AuthService {
  async getSessionProfile(): Promise<UserProfile> {
    return {
      id: 'local-dev-user',
      username: 'opensource-developer',
      avatarUrl: 'https://github.com/identicons/worksmarter.png',
      githubConnected: true,
      googleConnected: false,
    };
  }
}
