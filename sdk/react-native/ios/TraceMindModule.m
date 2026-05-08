#if __has_include(<React/RCTBridgeModule.h>)
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(TraceMindModule, NSObject)

RCT_EXTERN_METHOD(start:(NSDictionary *)config)
RCT_EXTERN_METHOD(capture:(NSString *)type payload:(NSDictionary *)payload)

@end
#endif
