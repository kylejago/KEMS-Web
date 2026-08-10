const target = process.argv[2] || "http://127.0.0.1:4173/api/health";
try {
  const response = await fetch(target, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) process.exit(1);
  const body = await response.json().catch(() => ({}));
  if (body?.ok === false) process.exit(1);
  process.stdout.write("ok\n");
} catch {
  process.exit(1);
}
