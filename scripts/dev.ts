const child = Bun.spawn({
  cmd: [process.execPath, "--hot", "src/index.html"],
  cwd: process.cwd(),
  env: process.env,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});

process.exitCode = await child.exited;
