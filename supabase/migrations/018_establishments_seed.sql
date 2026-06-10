-- =============================================================================
-- GIRO JERI — Migration 018: localidade/preço + seed do guia de estabelecimentos
-- =============================================================================
-- 1. Colunas locality e price_note em establishments.
-- 2. Seed com ~90 estabelecimentos reais do guia público (Jericoacoara, Preá,
--    Jijoca/Lagoas, Caiçara), por localidade e categoria. Imagens ficam em
--    branco (adicionadas depois pelo admin).
-- Idempotente: só insere nomes que ainda não existem (pode rodar mais de uma vez).
-- =============================================================================

ALTER TABLE establishments
  ADD COLUMN IF NOT EXISTS locality   VARCHAR(80),
  ADD COLUMN IF NOT EXISTS price_note VARCHAR(60);

INSERT INTO establishments (name, category, locality, description, price_note, address, is_active)
SELECT v.name, v.category, v.locality, v.description, v.price_note, v.address, TRUE
FROM (VALUES
  -- ── JERICOACOARA · Gastronomia ──────────────────────────────────────────────
  ('Beco do Mar','gastronomia','Jericoacoara','Restaurante italiano e brasileiro, indicado para jantar e casais.','R$ 90-150/pessoa','Centro da Vila de Jericoacoara'),
  ('Restaurante Alecrim','gastronomia','Jericoacoara','Frutos do mar, risotos e massas; conhecido pelo polvo grelhado.','R$ 85-140/pessoa','Beco do Forró, Vila de Jericoacoara'),
  ('Restaurante Tamarindo','gastronomia','Jericoacoara','Cozinha brasileira e internacional; destaque para camarões e sobremesas.','R$ 150-250/pessoa','Travessa Ismael, entre Rua do Forró e Rua Principal'),
  ('Bistrô Caiçara','gastronomia','Jericoacoara','Bistrô de frutos do mar e cozinha brasileira, perfil sofisticado.','R$ 150-240/pessoa','Centro da Vila de Jericoacoara'),
  ('567 Burger','gastronomia','Jericoacoara','Hambúrgueres artesanais e carnes com blends defumados.','R$ 55-95/pessoa','Centro da Vila de Jericoacoara'),
  ('Kûara Grill & Bistrô','gastronomia','Jericoacoara','Cozinha brasileira e internacional; opções grelhadas e buffet.','R$ 65-110/pessoa','Centro da Vila de Jericoacoara'),
  ('Gelato & Grano Jericoacoara','gastronomia','Jericoacoara','Gelateria e cafeteria; sorvetes artesanais, sobremesas e lanches.','R$ 25-55/pessoa','Centro da Vila de Jericoacoara'),
  ('Crepioca Jeri Fit Food','gastronomia','Jericoacoara','Crepiocas, pratos leves, vegetarianos e veganos.','R$ 30-60/pessoa','Centro da Vila de Jericoacoara'),
  ('Jerizando Burger','gastronomia','Jericoacoara','Hambúrgueres e lanches rápidos, opção econômica.','R$ 35-65/pessoa','Centro da Vila de Jericoacoara'),
  ('Jerizando Restaurante e Pizzaria','gastronomia','Jericoacoara','Pizzas, comida brasileira, bar e opções de frutos do mar.','R$ 60-110/pessoa','Centro da Vila de Jericoacoara'),
  ('Romã Jericoacoara','gastronomia','Jericoacoara','Pizzas e cozinha ítalo-brasileira em ambiente casual.','R$ 75-130/pessoa','Centro da Vila de Jericoacoara'),
  ('Naturalmente','gastronomia','Jericoacoara','Creperia e cozinha saudável com vista para a praia.','R$ 65-110/pessoa','Orla / Praia Principal, Jericoacoara'),
  ('Na Casa Dela','gastronomia','Jericoacoara','Cozinha autoral em ambiente rústico e romântico.','R$ 120-200/pessoa','Beco do Forró, Vila de Jericoacoara'),
  ('Dona Amélia','gastronomia','Jericoacoara','Comida brasileira e frutos do mar; perfil tradicional e familiar.','R$ 65-115/pessoa','Rua do Forró, Vila de Jericoacoara'),
  ('Bistrôgonoff','gastronomia','Jericoacoara','Bistrô conhecido por strogonoffs e pratos variados.','R$ 65-120/pessoa','Centro da Vila de Jericoacoara'),
  ('Restaurante Vila K','gastronomia','Jericoacoara','Restaurante com vista e cozinha brasileira contemporânea.','R$ 90-160/pessoa','Área central, próxima à praia'),
  ('ClubVentos Lounge','gastronomia','Jericoacoara','Lounge à beira-mar, bebidas, massas, frutos do mar e sunset.','R$ 85-150/pessoa','Praia Principal, Jericoacoara'),
  ('Restaurante Miragem','gastronomia','Jericoacoara','Cozinha contemporânea com ceviches, peixes, polvo e sobremesas.','R$ 120-210/pessoa','Rua São Francisco, Vila de Jericoacoara'),
  ('Los Locos Jeri','gastronomia','Jericoacoara','Lanches rápidos e comida americana, com bom custo-benefício.','R$ 30-60/pessoa','Centro da Vila de Jericoacoara'),
  ('Jeri Mescla','gastronomia','Jericoacoara','Doceria e café para lanches, doces e sobremesas.','R$ 25-50/pessoa','Centro da Vila de Jericoacoara'),
  -- ── JERICOACOARA · Hospedagem ───────────────────────────────────────────────
  ('Pousada Meu Lugar','hospedagem','Jericoacoara','Pousada econômica, quartos com ar-condicionado e Wi-Fi.','R$ 180-320/diária','Área residencial da Vila, ~12 min a pé da praia'),
  ('Villa Mango Jeri','hospedagem','Jericoacoara','Hotel boutique com piscina, jardim e ambiente tranquilo.','R$ 500-750/diária','A cerca de 5 min do centro da Vila'),
  ('Pousada Chez Toi','hospedagem','Jericoacoara','Pousada com piscina, bar e localização central.','R$ 550-800/diária','Centro, perto da Duna do Pôr do Sol'),
  ('Pousada Jeribá','hospedagem','Jericoacoara','Hospedagem de alto padrão, restaurante e vista para o mar.','R$ 1.200-2.300/diária','Beira-mar, próxima ao centro'),
  ('Essenza Hotel','hospedagem','Jericoacoara','Hotel de luxo, piscinas privativas em algumas suítes e vista frontal.','R$ 1.800-3.500/diária','Praia Principal, Jericoacoara'),
  ('My Blue Hotel','hospedagem','Jericoacoara','Hotel pé na areia, piscina, spa e fácil acesso à vila.','R$ 450-800/diária','Praia Principal / Centro'),
  ('Blue Residence Hotel','hospedagem','Jericoacoara','Apart-hotel com unidades amplas, piscina e restaurante.','R$ 500-900/diária','Beira-mar, próximo à Praia Principal'),
  ('Vila Kalango','hospedagem','Jericoacoara','Hotel charmoso com bangalôs, piscina e integração com a natureza.','R$ 1.100-2.000/diária','Beira-mar, Vila de Jericoacoara'),
  ('The Chili Beach Private Resort','hospedagem','Jericoacoara','Resort boutique de luxo, piscina, restaurante e day use sob reserva.','R$ 2.000-4.000/diária','Praia da Malhada'),
  ('Hurricane Jeri','hospedagem','Jericoacoara','Hotel boutique com piscina, jardim e proposta de bem-estar.','R$ 900-1.700/diária','Praia da Malhada'),
  ('Apenunga Eco Hotel','hospedagem','Jericoacoara','Eco-hotel de padrão elevado, piscina e proposta sustentável.','R$ 900-1.600/diária','Vila de Jericoacoara'),
  ('Saluz Boutique Hotel','hospedagem','Jericoacoara','Hotel boutique contemporâneo, piscina e serviços de padrão superior.','R$ 600-1.000/diária','Vila de Jericoacoara'),
  ('Café Jeri Hotel','hospedagem','Jericoacoara','Hotel com rooftop conhecido pelo sunset, música e eventos.','R$ 700-1.200/diária','Centro da Vila de Jericoacoara'),
  -- ── JERICOACOARA · Comércio, turismo e serviços ─────────────────────────────
  ('Atacadão do Vale - Jeri','compras','Jericoacoara','Mercado/atacarejo com alimentos, bebidas, higiene e itens do dia a dia.','R$ 80-180/cesta','Rua Principal e Rua Manuel Vicente, Vila de Jericoacoara'),
  ('Lojinha Caiçara','compras','Jericoacoara','Souvenires, fotografias e produtos personalizados do turismo local.','R$ 30-150/item','Região de Jericoacoara / Buraco Azul'),
  ('COOPBJ - Bugueiros de Jeri','compras','Jericoacoara','Cooperativa de bugueiros para passeios privativos pela região.','R$ 520-650/buggy','Atendimento na Vila e roteiros leste/oeste'),
  ('Travel to Jeri / Bora Turismo','compras','Jericoacoara','Agenciamento de passeios, transfers e experiências turísticas.','R$ 75-600/serviço','Rua Principal, Vila de Jericoacoara'),
  ('Café Jeri Rooftop','compras','Jericoacoara','Rooftop de sunset, DJs, apresentações e consumo de bebidas.','R$ 50-120/pessoa','Centro da Vila de Jericoacoara'),
  -- ── PREÁ · Gastronomia ──────────────────────────────────────────────────────
  ('Gato na Brasa Steakhouse','gastronomia','Preá','Steakhouse e cozinha brasileira, especializado em carnes.','R$ 80-140/pessoa','Centro / área urbana do Preá'),
  ('La Cantina Salumeria Italiana','gastronomia','Preá','Cozinha italiana e mediterrânea, massas, frios e vinhos.','R$ 85-150/pessoa','Centro do Preá'),
  ('Restaurante da Lu','gastronomia','Preá','Restaurante à beira-mar, especializado em frutos do mar.','R$ 75-130/pessoa','Orla da Praia do Preá'),
  ('Quintalzin Restaurante','gastronomia','Preá','Cozinha brasileira e frutos do mar em ambiente aconchegante.','R$ 75-130/pessoa','Centro do Preá'),
  ('Yûhi Sushi','gastronomia','Preá','Restaurante japonês com sushis, sashimis e combinados.','R$ 80-150/pessoa','Centro do Preá'),
  ('Quintal do Denis','gastronomia','Preá','Cozinha nacional e internacional; ambiente indicado para jantar.','R$ 90-160/pessoa','Centro do Preá'),
  ('Restaurante Rancho do Peixe','gastronomia','Preá','Frutos do mar e pratos sofisticados com vista para o mar.','R$ 120-210/pessoa','Hotel Rancho do Peixe, orla do Preá'),
  ('Pizzaria Vero Capo Preá','gastronomia','Preá','Pizzas artesanais assadas em forno a lenha.','R$ 55-100/pessoa','Próxima à praia, Preá'),
  ('Restaurante Canoas','gastronomia','Preá','Porções, peixes, frutos do mar e drinks; procurado no almoço.','R$ 70-125/pessoa','Faixa de areia / orla do Preá'),
  ('Pão do Sol','gastronomia','Preá','Padaria/lanchonete econômica para café da manhã e lanches.','R$ 20-45/pessoa','Centro do Preá'),
  ('Açaí 10zano','gastronomia','Preá','Açaí, cremes, frutas e lanches rápidos.','R$ 18-40/pessoa','Centro do Preá'),
  ('Le Rooftop','gastronomia','Preá','Rooftop com drinks, petiscos e ambiente noturno.','R$ 60-120/pessoa','Área central do Preá'),
  ('Restaurante Preabeach','gastronomia','Preá','Cozinha internacional, serviço de hotel boutique e vista para o mar.','R$ 120-220/pessoa','Preabeach Experience, orla do Preá'),
  -- ── PREÁ · Hospedagem ───────────────────────────────────────────────────────
  ('Rancho do Peixe','hospedagem','Preá','Bangalôs rústicos, piscina, spa, restaurante e estrutura para kitesurf.','R$ 1.100-2.200/diária','Beira-mar, Praia do Preá'),
  ('Pousada Preamar','hospedagem','Preá','Pousada bem avaliada, jardim, Wi-Fi e apoio a esportes aquáticos.','R$ 280-480/diária','A cerca de 6 min a pé da praia'),
  ('Vilarejo Preá','hospedagem','Preá','Hospedagem de estilo praiano, próxima ao mar e aos serviços.','R$ 350-650/diária','Praia do Preá'),
  ('Ventana Hotel','hospedagem','Preá','Hotel com proposta voltada ao vento, praia e prática de kitesurf.','R$ 450-800/diária','Praia do Preá'),
  ('Preabeach Boutique Hotel & Spa','hospedagem','Preá','Hotel boutique com vilas, spa, piscina, restaurante e aulas de kite.','R$ 1.200-2.800/diária','Beira-mar, Praia do Preá'),
  ('Yemanjá Hotel','hospedagem','Preá','Hospedagem de padrão superior com ambiente praiano e piscina.','R$ 600-1.000/diária','Praia do Preá'),
  ('Pousada Paraíso dos Ventos Preá','hospedagem','Preá','Suítes espaçosas, piscina, bar e café da manhã.','R$ 350-600/diária','Cerca de 700 m da praia'),
  ('Kite Lodge Brazil','hospedagem','Preá','Pousada com vista para o mar, piscina, bar e restaurante.','R$ 550-950/diária','Ponto de kitesurf na Praia do Preá'),
  ('Kabana Hotel','hospedagem','Preá','Hotel quatro estrelas com piscina, restaurante e arquitetura sofisticada.','R$ 650-1.100/diária','Praia do Preá'),
  ('Casana Hotel','hospedagem','Preá','Hotel de luxo com poucos bangalôs, jardins amplos e gastronomia.','R$ 2.000-4.000/diária','Beira-mar, Praia do Preá'),
  -- ── PREÁ · Comércio, turismo e serviços ─────────────────────────────────────
  ('Supermercado Pinheiro Preá','compras','Preá','Supermercado amplo com hortifrúti, padaria, carnes, queijos e bebidas.','R$ 100-250/cesta','Praia do Preá'),
  ('Shopping Variedades Preá','compras','Preá','Loja de variedades, utilidades, presentes e itens de uso diário.','R$ 20-120/item','Av. Francisco Xavier Chaves, Preá'),
  ('Farmácia Pai / Sampaio Preá','compras','Preá','Medicamentos, higiene, beleza e itens de cuidados pessoais.','R$ 25-100/compra','Área central do Preá'),
  ('Preabeach Experience - Kite & Passeios','compras','Preá','Aulas de kitesurf, buggy, quadriciclo, cavalo e experiências sob medida.','R$ 250-700/atividade','Orla do Preá'),
  -- ── JIJOCA / LAGOAS · Gastronomia, beach clubs e atrações ───────────────────
  ('Alchymist Beach Club','gastronomia','Lagoa do Paraíso','Beach club estruturado com redes na água, restaurante e áreas VIP.','R$ 180-350/pessoa/dia','Lagoa do Paraíso, Jijoca'),
  ('Restaurante Nova Esperança','gastronomia','Lagoa do Paraíso','Ambiente simples e tranquilo, com mesas e redes na lagoa.','R$ 65-120/pessoa','Lagoa do Paraíso'),
  ('Restaurante Água Viva','gastronomia','Lagoa do Paraíso','Comida regional e estrutura à beira da lagoa, perfil familiar.','R$ 65-120/pessoa','Lagoa do Paraíso'),
  ('Restaurante do Paulo','gastronomia','Lagoa do Paraíso','Restaurante tradicional, ambiente tranquilo e vista panorâmica da lagoa.','R$ 70-130/pessoa','Lagoa do Paraíso'),
  ('Tobias da Caranguejada','gastronomia','Caiçara','Conhecido pela caranguejada com arroz, pirão e vinagrete.','R$ 70-130/pessoa','Região de Caiçara / Lagoa Azul'),
  ('Brisa do Paraíso','gastronomia','Lagoa do Paraíso','Pousada e restaurante com mesas sobre a água, redes, jangada e caiaque.','R$ 70-140/pessoa','Margens da Lagoa do Paraíso'),
  ('Sal e Sabor','gastronomia','Jijoca de Jericoacoara','Variedade de pratos e estrutura para grupos.','R$ 45-90/pessoa','CE-085, Jijoca de Jericoacoara'),
  ('Restaurante Jijoca','gastronomia','Jijoca de Jericoacoara','Cozinha brasileira com carnes, risotos e pratos executivos.','R$ 55-110/pessoa','Centro de Jijoca de Jericoacoara'),
  ('Pousada e Restaurante Lagoa Azul','gastronomia','Jijoca de Jericoacoara','Restaurante, bar, piscina e acesso à região lacustre.','R$ 60-120/pessoa','Região das lagoas, Jijoca'),
  ('Casa B&B - Restaurante','gastronomia','Lagoa do Paraíso','Elogiada pela comida e atendimento personalizado.','R$ 80-150/pessoa','Lagoa do Paraíso'),
  ('Buraco Azul Caiçara','gastronomia','Caiçara','Atração de águas azul-turquesa, com estrutura de visitação e alimentação.','R$ 40/entrada','Distrito de Caiçara, região de Jijoca/Preá'),
  ('Lagun Beach Club','gastronomia','Caiçara','Beach club com piscinas, gastronomia, área infantil e funcionamento diurno.','R$ 30-180/pessoa/dia','Rua Cavalo Bravo, Caiçara - Cruz'),
  -- ── JIJOCA / LAGOAS · Hospedagem ────────────────────────────────────────────
  ('Aloha Palace Hotel','hospedagem','Jijoca de Jericoacoara','Hotel urbano com acesso fácil a comércio e transportes.','R$ 220-380/diária','Centro de Jijoca de Jericoacoara'),
  ('Pousada Unidos','hospedagem','Jijoca de Jericoacoara','Pousada econômica para estadias curtas e apoio a passeios.','R$ 160-280/diária','Jijoca de Jericoacoara'),
  ('Aconchego da Nina','hospedagem','Jijoca de Jericoacoara','Pousada com jardim, estacionamento e café da manhã elogiado.','R$ 190-320/diária','Jijoca de Jericoacoara'),
  ('Pousada Aconcheg''us','hospedagem','Jijoca de Jericoacoara','Pousada tranquila com jardim, Wi-Fi e atendimento familiar.','R$ 200-340/diária','Jijoca de Jericoacoara'),
  ('Pedacinho do Paraíso Pousada','hospedagem','Jijoca de Jericoacoara','Pousada com jardim, estacionamento, restaurante e bar.','R$ 230-400/diária','Jijoca de Jericoacoara'),
  ('Nomads Lagoa','hospedagem','Lagoa do Paraíso','Hospedagem próxima às lagoas, voltada a descanso e natureza.','R$ 300-550/diária','Região da Lagoa do Paraíso'),
  ('Pousada Paraíso Natural','hospedagem','Jijoca de Jericoacoara','Pousada integrada à natureza, próxima a atrações lacustres.','R$ 300-550/diária','Região das lagoas, Jijoca'),
  ('Pousada e Restaurante do Paulo','hospedagem','Lagoa do Paraíso','Hospedagem tradicional às margens da lagoa, com restaurante e vista.','R$ 270-480/diária','Lagoa do Paraíso'),
  -- ── JIJOCA / LAGOAS · Comércio, turismo e serviços ──────────────────────────
  ('Supermercado Brasil Frios','compras','Jijoca de Jericoacoara','Alimentos, frios, bebidas e itens de uso diário.','R$ 90-220/cesta','Av. Manoel Teixeira, 114 - Centro, Jijoca'),
  ('+ Frios Food Service','compras','Jijoca de Jericoacoara','Distribuidora/loja de frios e produtos para alimentação e comércio.','R$ 80-300/compra','Av. Manoel Teixeira, 80 - Centro, Jijoca'),
  ('Farmácia Pro Saúde','compras','Jijoca de Jericoacoara','Medicamentos, perfumaria, vitaminas, higiene e cuidados pessoais.','R$ 25-120/compra','Centro de Jijoca de Jericoacoara'),
  ('Super Mercado Tem de Tudo','compras','Jijoca de Jericoacoara','Mercado tradicional com alimentos, bebidas e produtos domésticos.','R$ 80-200/cesta','Jijoca de Jericoacoara'),
  ('Transfer 4x4 Jijoca - Jeri / Aeroporto','compras','Jijoca de Jericoacoara','Transporte em veículo 4x4; valores dependem de rota, horário e lotação.','R$ 300-600/veículo','Saídas de Jijoca, aeroporto e Vila de Jericoacoara')
) AS v(name, category, locality, description, price_note, address)
WHERE NOT EXISTS (SELECT 1 FROM establishments e WHERE e.name = v.name);
