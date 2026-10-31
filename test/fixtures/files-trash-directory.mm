// Test-only lookup, never a trash operation or a production capability.
// Foundation NSPathUtilities.h declares NSTrashDirectory since macOS 10.8.
// NSFileManager.h documents URLForDirectory:create:NO as a lookup. Its
// appropriateForURL argument is documented for item replacement only; use nil
// and require the fixture source and this user Trash directory on one device.
#import <Foundation/Foundation.h>
#include <cstdio>

int main(int argc, char**) {
  if (argc != 1) return 2;
  @autoreleasepool {
    @try {
      NSURL* url = [[NSFileManager defaultManager]
          URLForDirectory:NSTrashDirectory
                 inDomain:NSUserDomainMask
        appropriateForURL:nil
                   create:NO
                    error:nullptr];
      if (!url || !url.isFileURL || !url.path) return 3;
      NSData* json = [NSJSONSerialization dataWithJSONObject:@{@"directory": url.path}
                                                   options:0 error:nullptr];
      if (!json) return 4;
      return fwrite(json.bytes, 1, json.length, stdout) == json.length ? 0 : 5;
    } @catch (NSException* exception) {
      (void)exception;
      return 6; // No native text or private paths on stderr.
    }
  }
}
