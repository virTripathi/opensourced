import { Controller, Post, Body, Sse, MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AgentService } from './agent.service';
import { GitHubContext } from '@worksmarter/common/types';

@Controller('api/agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post('stream')
  @Sse('stream-action')
  streamAction(
    @Body('action') action: string,
    @Body('context') context: GitHubContext
  ): Observable<MessageEvent> {
    return this.agentService.dispatchAction(action, context).pipe(
      map((event) => ({
        data: event,
      }))
    );
  }
}
