#import <Foundation/Foundation.h>
#include <cerrno>
#include "files-trash-macos.h"

int TrashMacOS(const std::string& source, std::string& resultingPath) {
  @autoreleasepool {
    @try {
      // This is a literal filesystem path, never a parsed URL or resolved link.
      // Explicit isDirectory avoids the convenience constructor's stat probe.
      NSURL* url = [NSURL fileURLWithFileSystemRepresentation:source.c_str()
                                                isDirectory:NO relativeToURL:nil];
      NSFileManager* manager = [[[NSFileManager alloc] init] autorelease];
      NSURL* result = nil;
      if (!url || ![manager trashItemAtURL:url resultingItemURL:&result error:nullptr])
        return EIO;
      // A missing result is not proof of rollback: the backend reports unknown.
      const char* pathname = result.fileSystemRepresentation;
      if (!pathname || pathname[0] != '/') return EIO;
      resultingPath = pathname;
      return 0;
    } @catch (NSException* exception) {
      (void)exception;
      return EIO;
    }
  }
}
