-- Tricot : glossaire des abréviations classiques des patrons, en français et en anglais.
--
--   knit_glossary   abréviation (« ssk », « m. end. »), langue des patrons où on la trouve (fr / en) et explication
--                   en français. Lu par l'appli pour expliquer le texte des étapes d'un toucher ; les abréviations
--                   propres à un patron (knit_projects.abbreviations) passent avant.
--
-- La recherche dans le texte respecte la casse : « M » (une taille) n'est pas « m. » (maille).

create table public.knit_glossary (
  lang text not null check (lang in ('fr', 'en')),
  abbr text not null check (char_length(btrim(abbr)) between 1 and 40),
  meaning text not null check (char_length(btrim(meaning)) between 1 and 300),
  primary key (lang, abbr)
);

alter table public.knit_glossary enable row level security;
create policy "glossaire lisible" on public.knit_glossary for select to authenticated using (true);
grant select on public.knit_glossary to authenticated;

insert into public.knit_glossary (lang, abbr, meaning) values
  ('fr', 'm.', 'Maille(s).'),
  ('fr', 'm. end.', 'Maille(s) endroit.'),
  ('fr', 'm. env.', 'Maille(s) envers.'),
  ('fr', 'end.', 'Endroit : maille endroit, ou côté endroit du travail.'),
  ('fr', 'env.', 'Envers : maille envers, ou côté envers du travail.'),
  ('fr', 'rg', 'Rang.'),
  ('fr', 'rgs', 'Rangs.'),
  ('fr', 'tr.', 'Tour (tricot en rond).'),
  ('fr', 'dim.', 'Diminution(s) : une maille de moins.'),
  ('fr', 'aug.', 'Augmentation(s) : une maille de plus.'),
  ('fr', 'gl.', 'Glisser : passer la maille sur l’aiguille droite sans la tricoter.'),
  ('fr', 'ens.', 'Ensemble : tricoter les mailles ensemble (une diminution).'),
  ('fr', '2 m. ens.', 'Tricoter 2 mailles ensemble à l’endroit : une diminution inclinée vers la droite.'),
  ('fr', '2 m. ens. env.', 'Tricoter 2 mailles ensemble à l’envers : une diminution.'),
  ('fr', 'surjet simple', 'Glisser 1 m., tricoter 1 m. endroit, rabattre la maille glissée dessus : une diminution inclinée vers la gauche.'),
  ('fr', 'surjet double', 'Glisser 1 m., tricoter 2 m. ensemble, rabattre la maille glissée dessus : deux mailles en moins.'),
  ('fr', 'jeté', 'Passer le fil sur l’aiguille droite : une maille de plus, avec un petit trou (dentelle).'),
  ('fr', 'torse', 'Tricoter la maille par le brin arrière, ce qui la vrille.'),
  ('fr', 'rab.', 'Rabattre : arrêter les mailles.'),
  ('fr', 'mon.', 'Monter les mailles.'),
  ('en', 'k', 'Knit : maille endroit.'),
  ('en', 'p', 'Purl : maille envers.'),
  ('en', 'st', 'Stitch : maille.'),
  ('en', 'sts', 'Stitches : mailles.'),
  ('en', 'k2tog', 'Knit 2 together : 2 mailles ensemble à l’endroit, diminution inclinée vers la droite.'),
  ('en', 'p2tog', 'Purl 2 together : 2 mailles ensemble à l’envers.'),
  ('en', 'ssk', 'Slip slip knit : glisser 2 mailles une à une comme à l’endroit, puis les tricoter ensemble par le brin arrière : diminution inclinée vers la gauche.'),
  ('en', 'skp', 'Slip, knit, pass : surjet simple (diminution inclinée vers la gauche).'),
  ('en', 'sk2p', 'Surjet double : deux mailles en moins.'),
  ('en', 'yo', 'Yarn over : jeté (une maille de plus, avec un trou).'),
  ('en', 'm1', 'Make 1 : augmentation intercalaire (relever le fil entre deux mailles et le tricoter torse).'),
  ('en', 'm1l', 'Make 1 left : augmentation intercalaire inclinée vers la gauche.'),
  ('en', 'm1r', 'Make 1 right : augmentation intercalaire inclinée vers la droite.'),
  ('en', 'kfb', 'Knit front and back : tricoter la maille par le brin avant puis arrière (une augmentation).'),
  ('en', 'sl', 'Slip : glisser la maille sans la tricoter.'),
  ('en', 'psso', 'Pass slipped stitch over : rabattre la maille glissée par-dessus.'),
  ('en', 'tbl', 'Through back loop : par le brin arrière (maille torse).'),
  ('en', 'pm', 'Place marker : placer un marqueur.'),
  ('en', 'sm', 'Slip marker : passer le marqueur.'),
  ('en', 'RS', 'Right side : endroit du travail.'),
  ('en', 'WS', 'Wrong side : envers du travail.'),
  ('en', 'CO', 'Cast on : monter les mailles.'),
  ('en', 'BO', 'Bind off : rabattre les mailles.'),
  ('en', 'rep', 'Repeat : répéter.'),
  ('en', 'rnd', 'Round : tour (tricot en rond).'),
  ('en', 'rnds', 'Rounds : tours.'),
  ('en', 'w&t', 'Wrap and turn : envelopper la maille et tourner (rangs raccourcis).'),
  ('en', 'St st', 'Stockinette stitch : jersey.');
