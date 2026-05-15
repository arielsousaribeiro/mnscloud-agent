# mnscloud-agent

Agente local unico e generico da MNSCloud.

O agente roda como servico nativo `systemd` no servidor Linux e se comunica com a API central por HTTPS outbound. Existe somente um runtime: ele executa o que estiver permitido pelas capabilities declaradas no `agent.conf`, pelos assignments da API e pelo tipo de job recebido.

## Contrato

- Produto/runtime: `mnscloud-agent`
- Pasta do projeto: `agent/`
- Instalador: `agent/scripts/install-agent.sh`
- Servico: `mnscloud-agent.service`
- Configuracao local: `/etc/mnscloud/agent/agent.conf`
- Estado local: `/var/lib/mnscloud/agent`
- Logs locais: `/var/log/mnscloud/agent`

## Instalacao

```bash
agent/scripts/install-agent.sh
```

O instalador prepara Deno, cria ou reaproveita `/var/lib/mnscloud/agent/agent.uuid`, grava `agent.conf`, instala o unit file e inicia `mnscloud-agent`.

Depois da instalacao, cadastre o UUID na aplicacao MNSCloud e gere o token. O token fica em `/var/lib/mnscloud/agent/agent.token`; apos gravar o token, reinicie o servico.

## Seguranca

- Comunicacao sempre outbound para a API.
- Um unico agente; limites sao por permissao do sistema, capabilities e jobs.
- Capabilities sao declaradas pelo host e sincronizadas no heartbeat.
- Credenciais permanentes de storage ficam somente na API.
- Jobs usam autorizacao temporaria, como URLs assinadas.
- Arquivos locais so podem ser lidos/escritos nos roots configurados.
- Gravacoes locais podem ser removidas somente depois de upload confirmado.

Veja [agent.md](./agent.md) para o desenho completo e [SKILL.md](./SKILL.md) para o contrato de evolucao tecnica.
