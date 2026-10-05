import { describe, expect, it } from 'vitest';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('AppController', () => {
  it('trả về lời chào của AppService ở route gốc', () => {
    const controller = new AppController(new AppService());

    expect(controller.getHello()).toBe('xin chao buoi sang');
  });
});
