-- A pasta de cupons passa a aceitar a nota fiscal em PDF, além das fotos
update storage.buckets
   set allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf']
 where id = 'cupons';
