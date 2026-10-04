# Store user configuration under XDG_CONFIG_HOME

OMXTerm reads its JSON configuration from
`$XDG_CONFIG_HOME/omxterm/config.json`. When `XDG_CONFIG_HOME` is unset or empty,
it uses `$HOME/.config/omxterm/config.json`. This visible, portable location works
well with dotfile tools across the Supported Platforms, unlike the macOS-specific
Application Support directory. Operational logs use the separate XDG state
location; configuration is not a terminal history or session-state store.
