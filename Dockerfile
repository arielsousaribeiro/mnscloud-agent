FROM denoland/deno:2.5.6

WORKDIR /app

COPY deno.jsonc ./deno.jsonc
COPY main.ts ./main.ts

RUN deno cache main.ts

USER deno

CMD ["deno", "task", "start"]
