#pragma once
#include <string>

// Worker-thread only. Paths are validated absolute UTF-8 drive paths. Both
// return 0 or a fixed errno, never Windows error text.
int MoveWindows(const std::string& source, const std::string& destination);
int TrashWindows(const std::string& source);
