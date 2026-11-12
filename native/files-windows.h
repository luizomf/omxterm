#pragma once
#include <string>

// Worker-thread only. Paths are validated absolute UTF-8 drive paths. Both
// return 0 or a fixed errno, never Windows error text.
int MoveWindows(const std::string& source, const std::string& destination);
int TrashWindows(const std::string& source);

// TrashWindows refused an item the Recycle Bin can't take. Nothing changed.
#define FILES_NOT_RECYCLED (-2)
