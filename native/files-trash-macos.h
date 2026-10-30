#pragma once
#include <string>

// Worker-thread only. Returns a fixed errno, never NSError text or userInfo.
int TrashMacOS(const std::string& source, std::string& resultingPath);
