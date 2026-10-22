import type { CommandDefinition } from "../commands";
import { ALL, text, number, toggle, choice, command } from "./helpers";

export const DEVELOPER_COMMANDS: readonly CommandDefinition[] = [
  // Git
  command({
    id: "git_status",
    name: "Git Status",
    description: "Show the branch and changed files.",
    category: "Git",
    platforms: ALL,
    requires: ["git"],
    template: "git status -sb",
  }),
  command({
    id: "git_log",
    name: "Git History",
    description: "Show recent commits as a graph.",
    category: "Git",
    platforms: ALL,
    requires: ["git"],
    template: "git log --oneline --graph --decorate {count}",
    fields: [number("count", "Commits", { defaultValue: "20", prefix: "-n " })],
  }),
  command({
    id: "git_switch",
    name: "Switch Branch",
    description: "Switch to a branch, optionally creating it.",
    category: "Git",
    platforms: ALL,
    requires: ["git"],
    template: "git switch {create} {branch}",
    fields: [
      toggle("create", "Create the branch", "-c"),
      text("branch", "Branch", { required: true }),
    ],
  }),
  // Docker
  command({
    id: "docker_ps",
    name: "Containers",
    description: "List running containers, or all of them.",
    category: "Docker",
    platforms: ALL,
    requires: ["docker"],
    template: "docker ps {all}",
    fields: [toggle("all", "Include stopped containers", "-a")],
  }),
  command({
    id: "docker_logs",
    name: "Container Logs",
    description: "Show a container's logs.",
    category: "Docker",
    platforms: ALL,
    requires: ["docker"],
    template: "docker logs {follow} {tail} {container}",
    fields: [
      text("container", "Container", { required: true }),
      number("tail", "Last lines", { defaultValue: "100", prefix: "--tail " }),
      toggle("follow", "Follow", "-f"),
    ],
  }),
  command({
    id: "docker_shell",
    name: "Container Shell",
    description: "Open an interactive shell inside a running container.",
    category: "Docker",
    platforms: ALL,
    requires: ["docker"],
    template: "docker exec -it {container} {shell}",
    fields: [
      text("container", "Container", { required: true }),
      choice("shell", "Shell", [
        ["sh", "sh"],
        ["bash", "bash"],
        ["ash", "ash"],
      ]),
    ],
  }),
  command({
    id: "docker_disk",
    name: "Docker Disk Usage",
    description: "Show space used by images, containers and volumes.",
    category: "Docker",
    platforms: ALL,
    requires: ["docker"],
    template: "docker system df",
  }),
];
