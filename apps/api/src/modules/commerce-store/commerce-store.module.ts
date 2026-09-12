import { Module, OnModuleInit } from '@nestjs/common';
import { CommerceStoreController } from './commerce-store.controller.js';
import { CommerceStoreService } from './commerce-store.service.js';
import { assertAmazonCredentialKeyForEnvironment } from './credential-crypto.js';

@Module({
  controllers: [CommerceStoreController],
  providers: [CommerceStoreService],
  exports: [CommerceStoreService],
})
export class CommerceStoreModule implements OnModuleInit {
  onModuleInit() {
    assertAmazonCredentialKeyForEnvironment();
  }
}
