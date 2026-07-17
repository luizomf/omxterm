# Store user configuration under XDG_CONFIG_HOME

OMXTerm will read its JSON configuration from
`$XDG_CONFIG_HOME/omxterm/config.json`, falling back to
`$HOME/.config/omxterm/config.json` when the environment variable is
unset or empty. This deliberately favors a visible, portable, dotfile-friendly
location over the macOS-specific Application Support directory; future state,
cache, or data must use their appropriate locations rather than accumulating in
the configuration file.
