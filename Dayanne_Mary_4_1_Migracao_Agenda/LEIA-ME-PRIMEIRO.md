# Dayanne Mary — atualização 4.1 para o SITE ORIGINAL (candidata para homologação)

## O que mudou

- **Mantém o mesmo HTML e CSS originais** (os testes conferem os hashes de cabeçalho e estilos).
- O novo backend lê e grava agendamentos na coleção Firebase **`agendamentos`**, a mesma do aplicativo anterior.
- Consulta todos os agendamentos do dia ao criar reservas, inclusive os antigos; também verifica `bloqueios` antigos.
- Admin autenticado via Firebase Authentication pode administrar registros antigos e novos; dados existentes **não são apagados ou copiados**.
- Promoções, serviços e configurações novos continuam em coleções separadas `dm_bs_*`.
- Múltiplos serviços, descontos, preços administráveis, agenda, indicadores e WhatsApp permanecem na versão 4.1.

## Não publique por cima do site ainda sem estes passos

1. **Backup:** exporte ou faça cópia dos dados do Firestore antes da troca. A criação deste ZIP **não** é um backup das reservas reais.
2. **Site correto:** na Netlify abra o projeto `dayanne-mary.netlify.app` (não o projeto `dayanne-mary-beautystudio`). Confira o endereço antes de conectar qualquer repositório ou executar CLI.
3. **Variáveis de ambiente do site antigo:** `FIREBASE_SERVICE_ACCOUNT_B64` (chave privada em Base64, somente no Netlify), `ADMIN_UID` (UID exato do Firebase Auth). Não envie credenciais ao GitHub ou ao chat. A chave Firebase pública já está no frontend. Variáveis do outro site não migram automaticamente.
4. **Build obrigatório:** este projeto possui uma Function. Não envie só `public/` via drag-and-drop, pois a API não seria publicada. Pela Netlify, configure build a partir do projeto completo (`package.json`, `netlify.toml`, `netlify/functions`, `shared`, `public`). Diretório publicado = `public`; Functions = `netlify/functions`.
5. **Homologação em deploy de preview:** verifique que `/api?resource=beautyStudioCampanhas` devolve JSON. Teste login administrativo, leitura de reservas antigas, promoção e bloqueios. Não faça testes criando atendimentos fictícios sobre dados reais; use um projeto Firebase de homologação para testes de gravação.
6. **Troca de produção somente após testes:** assegure que `dayanne-mary.netlify.app` seja o único cliente recebendo novas reservas. O código novo usa transação para impedir conflitos entre reservas novas; não garante prevenção absoluta caso o aplicativo antigo continue aceitando reservas simultaneamente.
7. **Regras após validar a troca:** no Firebase Firestore, substituir regras públicas temporárias por `allow read, write: if false` (ou regras restritas equivalentes). A Function, via Firebase Admin SDK, não depende das regras de cliente. Isso deve ocorrer **após** confirmar que o novo frontend e backend funcionam.
8. **Rollback:** mantenha o deploy anterior do Netlify, mas atenção: se voltar para a versão antiga, ela depende novamente de acesso direto pelo navegador, que estará bloqueado pelas regras seguras.

### Risco de prazo

As regras temporárias usadas para recuperar o site antigo expiram em **07/11/2026 às 21:00 (America/Sao_Paulo)**. A publicação e testes devem ser concluídos antes disso, ou o site original terá novamente falhas de agendamento. **Não prorrogue regras públicas irrestritas de acesso a informações pessoais.**

### Verificações neste pacote

`npm test` executa testes estáticos, lógica de preços, intervalos e compatibilidade de coleções. `node --check` valida a sintaxe do servidor. **Não foram executados um build Netlify completo nem uma gravação real em produção.**

**O ZIP não publica automaticamente e não altera qualquer dado real do Firebase.**
