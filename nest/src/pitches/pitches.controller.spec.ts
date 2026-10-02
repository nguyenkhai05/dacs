import { Test, TestingModule } from '@nestjs/testing';
import { PitchesController } from './pitches.controller.js';

describe('PitchesController', () => {
  let controller: PitchesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PitchesController],
    }).compile();

    controller = module.get<PitchesController>(PitchesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
