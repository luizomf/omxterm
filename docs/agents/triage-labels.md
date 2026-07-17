# Triage labels

The engineering skills use five canonical triage roles. This table maps each
role to the exact label configured in GitHub.

| Canonical triage role | GitHub label       | Meaning                                      |
| --------------------- | ------------------ | -------------------------------------------- |
| `needs-triage`        | `needs-triage`     | Maintainer needs to evaluate this issue      |
| `needs-info`          | `needs-info`       | Waiting on the reporter for more information |
| `ready-for-agent`     | `ready-for-agent`  | Fully specified and ready for an agent       |
| `ready-for-human`     | `ready-for-human`  | Requires human implementation                |
| `wontfix`             | `wontfix`          | Will not be actioned                         |

When a skill names a canonical role, use the corresponding GitHub label from
this table. Preserve unrelated labels; these five describe triage state, not
issue type or priority.
