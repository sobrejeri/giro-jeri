/**
 * seed.js — Dados de teste para o Giro Jeri
 * Roda com: node packages/api/src/seed.js
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://poqiioyadddbuxcohwjy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvcWlpb3lhZGRkYnV4Y29od2p5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTc2NTU2OSwiZXhwIjoyMDkxMzQxNTY5fQ.w8uGCBiFhVLbZ9sJ4-eIkbxTOaDHCWw8lVdCsEevmNQ'
);

async function seed() {
  console.log('🌱 Iniciando seed...\n');

  // ── 1. Região ────────────────────────────────────────
  console.log('📍 Criando região...');
  const { data: region, error: rErr } = await supabase
    .from('regions')
    .upsert({ name: 'Jericoacoara', slug: 'jericoacoara', is_active: true }, { onConflict: 'slug' })
    .select().single();
  if (rErr) { console.error('Região:', rErr.message); } else { console.log('  ✅', region.name, region.id); }

  // ── 2. Categorias ────────────────────────────────────
  console.log('\n🏷  Criando categorias...');
  const cats = [
    { name: 'Buggy',     slug: 'buggy',      display_order: 1 },
    { name: 'Barco',     slug: 'barco',       display_order: 2 },
    { name: 'Lagoas',    slug: 'lagoas',      display_order: 3 },
    { name: 'Pôr do Sol',slug: 'por-do-sol',  display_order: 4 },
    { name: 'UTV',       slug: 'utv',         display_order: 5 },
  ];
  const { data: categories, error: cErr } = await supabase
    .from('categories')
    .upsert(cats, { onConflict: 'slug' })
    .select();
  if (cErr) { console.error('Categorias:', cErr.message); return; }
  categories.forEach(c => console.log('  ✅', c.name, c.id));
  const catMap = Object.fromEntries(categories.map(c => [c.slug, c.id]));

  // ── 3. Passeios ──────────────────────────────────────
  console.log('\n🏖  Criando passeios...');
  const tours = [
    {
      name: 'Buggy Dunas e Lagoas',
      slug: 'buggy-dunas-lagoas',
      region_id: region.id,
      category_id: catMap['buggy'],
      short_description: 'Explore as dunas e lagoas de Jericoacoara de buggy com guia especializado.',
      duration_hours: 6,
      min_people: 1,
      max_people: 20,
      is_active: true,
      is_featured: true,
      is_shared_enabled: true,
      is_private_enabled: true,
      shared_price_per_person: 120,
      highlight_badge: 'Mais popular',
      display_order: 1,
      rating_average: 4.9,
      rating_count: 87,
      tags: ['dunas', 'lagoas', 'aventura'],
    },
    {
      name: 'Pôr do Sol nas Dunas',
      slug: 'por-do-sol-dunas',
      region_id: region.id,
      category_id: catMap['por-do-sol'],
      short_description: 'Um espetáculo único: assista o pôr do sol do alto das dunas de Jericoacoara.',
      duration_hours: 2,
      min_people: 1,
      max_people: 30,
      is_active: true,
      is_featured: true,
      is_shared_enabled: true,
      is_private_enabled: true,
      shared_price_per_person: 80,
      highlight_badge: 'Imperdível',
      display_order: 2,
      rating_average: 5.0,
      rating_count: 124,
      tags: ['por-do-sol', 'romantico', 'dunas'],
    },
    {
      name: 'Lagoa do Paraíso',
      slug: 'lagoa-paraiso',
      region_id: region.id,
      category_id: catMap['lagoas'],
      short_description: 'Águas cristalinas e transparentes na lagoa mais famosa de Jericoacoara.',
      duration_hours: 4,
      min_people: 1,
      max_people: 20,
      is_active: true,
      is_featured: true,
      is_shared_enabled: true,
      is_private_enabled: true,
      shared_price_per_person: 95,
      display_order: 3,
      rating_average: 4.8,
      rating_count: 63,
      tags: ['lagoa', 'natureza', 'banho'],
    },
    {
      name: 'Passeio de Barco Pedra Furada',
      slug: 'barco-pedra-furada',
      region_id: region.id,
      category_id: catMap['barco'],
      short_description: 'Navegue até a famosa Pedra Furada e snorkel nas águas do litoral cearense.',
      duration_hours: 3,
      min_people: 4,
      max_people: 15,
      is_active: true,
      is_featured: false,
      is_shared_enabled: true,
      is_private_enabled: false,
      shared_price_per_person: 110,
      display_order: 4,
      rating_average: 4.7,
      rating_count: 42,
      tags: ['barco', 'snorkel', 'pedra-furada'],
    },
    {
      name: 'Buggy Completo — Dia Inteiro',
      slug: 'buggy-dia-inteiro',
      region_id: region.id,
      category_id: catMap['buggy'],
      short_description: 'O passeio mais completo: dunas, lagoas, praias remotas e pôr do sol tudo em um dia.',
      duration_hours: 10,
      min_people: 1,
      max_people: 16,
      is_active: true,
      is_featured: true,
      is_shared_enabled: false,
      is_private_enabled: true,
      shared_price_per_person: null,
      highlight_badge: 'Exclusivo',
      display_order: 5,
      rating_average: 4.9,
      rating_count: 31,
      tags: ['buggy', 'dia-inteiro', 'privativo'],
    },
    {
      name: 'Lagoa Azul e Paraíso',
      slug: 'lagoa-azul-paraiso',
      region_id: region.id,
      category_id: catMap['lagoas'],
      short_description: 'Visite as duas lagoas mais belas da região em um único passeio imperdível.',
      duration_hours: 5,
      min_people: 1,
      max_people: 20,
      is_active: true,
      is_featured: false,
      is_shared_enabled: true,
      is_private_enabled: true,
      shared_price_per_person: 130,
      display_order: 6,
      rating_average: 4.8,
      rating_count: 28,
      tags: ['lagoas', 'natureza'],
    },
  ];

  const { data: createdTours, error: tErr } = await supabase
    .from('tours')
    .upsert(tours, { onConflict: 'slug' })
    .select();
  if (tErr) { console.error('Passeios:', tErr.message); return; }
  createdTours.forEach(t => console.log('  ✅', t.name));

  // ── 4. Veículos ──────────────────────────────────────
  console.log('\n🚗 Criando veículos...');
  const vehicles = [
    { name: 'Buggy 4 lugares',  vehicle_type: 'buggy',  seat_capacity: 4,  base_price: 480,  is_active: true, is_private_allowed: true },
    { name: 'Buggy 6 lugares',  vehicle_type: 'buggy',  seat_capacity: 6,  base_price: 680,  is_active: true, is_private_allowed: true },
    { name: 'Hilux Cabine Dupla',vehicle_type: 'hilux', seat_capacity: 5,  base_price: 550,  is_active: true, is_private_allowed: true },
    { name: 'UTV Side by Side', vehicle_type: 'utv',    seat_capacity: 2,  base_price: 350,  is_active: true, is_private_allowed: true },
    { name: 'Van Executiva',    vehicle_type: 'van',    seat_capacity: 10, base_price: 900,  is_active: true, is_private_allowed: true },
  ];
  const { data: createdVehicles, error: vErr } = await supabase
    .from('vehicles').upsert(vehicles, { onConflict: 'name' }).select();
  if (vErr) { console.error('Veículos:', vErr.message); }
  else { createdVehicles.forEach(v => console.log('  ✅', v.name)); }

  // ── 5. Tour-Vehicles (relação passeio ↔ veículo) ─────
  if (createdVehicles && createdTours) {
    console.log('\n🔗 Vinculando veículos aos passeios...');
    const privateTours = createdTours.filter(t => t.is_private_enabled);
    const links = [];
    for (const tour of privateTours) {
      for (const vehicle of createdVehicles) {
        links.push({ tour_id: tour.id, vehicle_id: vehicle.id });
      }
    }
    const { error: tvErr } = await supabase
      .from('tour_vehicles').upsert(links, { onConflict: 'tour_id,vehicle_id' });
    if (tvErr) console.error('Tour-Vehicles:', tvErr.message);
    else console.log('  ✅', links.length, 'vínculos criados');
  }

  // ── 6. Transfer (serviço) ────────────────────────────
  console.log('\n✈️  Criando transfer...');
  const { data: transfer, error: trErr } = await supabase
    .from('transfers')
    .upsert({ name: 'Transfer Padrão', is_active: true }, { onConflict: 'name' })
    .select().single();
  if (trErr) { console.error('Transfer:', trErr.message); }
  else { console.log('  ✅', transfer.name, transfer.id); }

  // ── 7. Rotas de Transfer ─────────────────────────────
  if (transfer) {
    console.log('\n🗺  Criando rotas de transfer...');
    const routes = [
      { transfer_id: transfer.id, origin_name: 'Fortaleza — Aeroporto', destination_name: 'Jericoacoara',    default_price: 280, night_fee: 50, extra_stop_price: 30 },
      { transfer_id: transfer.id, origin_name: 'Jericoacoara',          destination_name: 'Fortaleza — Aeroporto', default_price: 280, night_fee: 50, extra_stop_price: 30 },
      { transfer_id: transfer.id, origin_name: 'Fortaleza — Centro',    destination_name: 'Jericoacoara',    default_price: 260, night_fee: 50, extra_stop_price: 30 },
      { transfer_id: transfer.id, origin_name: 'Cumbuco',               destination_name: 'Jericoacoara',    default_price: 220, night_fee: 40, extra_stop_price: 25 },
      { transfer_id: transfer.id, origin_name: 'Jericoacoara',          destination_name: 'Cumbuco',          default_price: 220, night_fee: 40, extra_stop_price: 25 },
      { transfer_id: transfer.id, origin_name: 'Praia do Preá',         destination_name: 'Jericoacoara',    default_price: 80,  night_fee: 20, extra_stop_price: 15 },
    ];
    const { data: createdRoutes, error: rtErr } = await supabase
      .from('transfer_routes').upsert(routes, { onConflict: 'transfer_id,origin_name,destination_name' }).select();
    if (rtErr) console.error('Rotas:', rtErr.message);
    else createdRoutes.forEach(r => console.log('  ✅', r.origin_name, '→', r.destination_name, `R$${r.default_price}`));
  }

  console.log('\n✅ Seed concluído!\n');
}

seed().catch(console.error);
