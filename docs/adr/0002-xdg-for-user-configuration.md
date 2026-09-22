# Store user configuration under XDG_CONFIG_HOME

OMXTerm reads its JSON configuration from
`$XDG_CONFIG_HOME/omxterm/config.json`. When `XDG_CONFIG_HOME` is unset or empty,
it uses `$HOME/.config/omxterm/config.json`. This visible, portable location works
well with dotfile tools across the Supported Platforms, unlike the macOS-specific
Application Support directory. Future state, cache, and data belong in their own
appropriate locations instead of the configuration file.
