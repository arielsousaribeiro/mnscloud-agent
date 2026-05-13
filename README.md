# mnscloud-agent

Agente local genérico da MNSCloud.

O agente roda no servidor onde existe algum recurso operacional da plataforma e se comunica com a API central por HTTPS outbound. Ele não recebe credenciais permanentes de storage; quando precisa executar uma ação sensível, a API entrega um job com autorização temporária e escopo mínimo.

A primeira capacidade implementada é `pabx`, usada para upload assíncrono de gravações geradas por Asterisk ou FreeSWITCH.

## Contrato

- Nome do produto/runtime: `mnscloud-agent`
- Pasta do projeto: `agent/`
- Dockerfile: `agent/Dockerfile`
- Container: `mnscloud-agent`
- Compose local: `/opt/mnscloud/agent/docker-compose.agent.yml`
- Configuração local: `/etc/mnscloud/agent/agent.conf`
- Estado local: `/var/lib/mnscloud/agent`
- Logs locais: `/var/log/mnscloud/agent`

## Instalação

```bash
scripts/install-agent.sh [--engine asterisk|freeswitch]
```

O instalador detecta Docker/Compose, oferece instalar Docker quando necessário, lê os tokens locais do PABX quando existirem e cria o `agent.conf`.

## Segurança

- A comunicação é sempre outbound para a API.
- O bootstrap inicial usa o token do recurso local, hoje `VoipPabxServer`.
- Após o enrollment, o agente usa `agent.uuid` e `agent.token`.
- O agente lê apenas caminhos permitidos em `recordings.roots`.
- Uploads usam URL assinada de curta duração gerada pela API.

Veja [agent.md](./agent.md) para a documentação completa do módulo e [SKILL.md](./SKILL.md) para o contrato de evolução técnica.
