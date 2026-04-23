import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getInfo() {
    return {
      name: 'Video Translation API',
      version: '1.0.0',
      docs: '/api/health',
    };
  }
}