#if __has_include(<React/RCTBridgeModule.h>)
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(TraceMindModule, NSObject)

RCT_EXTERN_METHOD(start:(NSDictionary *)config)
RCT_EXTERN_METHOD(capture:(NSString *)type payload:(NSDictionary *)payload)
RCT_EXTERN_METHOD(identify:(NSString *)userId traits:(NSDictionary *)traits)
RCT_EXTERN_METHOD(setScreen:(NSString *)screen)
RCT_EXTERN_METHOD(submitFeedback:(NSDictionary *)payload)

@end
#endif
