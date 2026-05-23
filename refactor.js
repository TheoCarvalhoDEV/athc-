const fs = require('fs');

const path = './src/pages/CreateEvent.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Replace state
content = content.replace(
  /const \[formData, setFormData\] = useState\(\{[\s\S]*?\}\);/m,
  `const { register, handleSubmit: formSubmit, watch, setValue, formState: { errors, isSubmitting }, reset } = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: '',
      date: '',
      time: '',
      publicType: 'Aberto',
      description: '',
      location: 'Centro',
      address: '',
      mediaUrls: [],
      hasTickets: false,
      whatsappNumber: ''
    }
  });
  
  const mediaUrls = watch('mediaUrls');
  const hasTickets = watch('hasTickets');
  const location = watch('location');
  const address = watch('address');`
);

// 2. Replace reset in useEffect
content = content.replace(
  /setFormData\(\{[\s\S]*?whatsappNumber: ev\.whatsappNumber \|\| ''\n\s*\}\);/m,
  `reset({
              title: ev.title,
              date: ev.date,
              time: ev.time,
              publicType: ev.publicType,
              description: ev.description,
              location: ev.location,
              address: ev.address || '',
              mediaUrls: ev.mediaUrls || [],
              hasTickets: ev.hasTickets || false,
              whatsappNumber: ev.whatsappNumber || ''
            });`
);

// 3. Replace handleSubmit
content = content.replace(
  /const handleSubmit = async \(e: React\.FormEvent\) => \{[\s\S]*?navigate\('\/profile'\);\n  \};/m,
  `const onSubmit = async (data: EventFormValues) => {
    const targetCreatorId = user?.profileId || userId!;
    const eventData = {
      id: id || Date.now().toString(),
      ...data,
      publicType: data.publicType as any,
      creatorId: id ? (originalCreatorId || targetCreatorId) : targetCreatorId,
    };
    await storage.saveEvent(eventData as any);
    toast.success('Evento salvo com sucesso!');
    navigate('/profile');
  };`
);

// 4. handleFileChange
content = content.replace(
  /setFormData\(prev => \(\{[\s\S]*?mediaUrls: \[\.\.\.prev\.mediaUrls, \.\.\.newUrls\]\n\s*\}\)\);/m,
  `setValue('mediaUrls', [...mediaUrls, ...newUrls], { shouldValidate: true });`
);

// 5. removeMedia
content = content.replace(
  /setFormData\(prev => \(\{[\s\S]*?mediaUrls: prev\.mediaUrls\.filter\(\(_, i\) => i !== index\)\n\s*\}\)\);/m,
  `setValue('mediaUrls', mediaUrls.filter((_, i) => i !== index), { shouldValidate: true });`
);

// 6. selectMockLocation
content = content.replace(
  /setFormData\(prev => \(\{ \.\.\.prev, location: loc, address: addr \}\)\);/m,
  `setValue('location', loc); setValue('address', addr, { shouldValidate: true });`
);

// 7. getAddressFromCoords
content = content.replace(
  /setFormData\(prev => \(\{ \.\.\.prev, location: name, address: addr \}\)\);/m,
  `setValue('location', name); setValue('address', addr, { shouldValidate: true });`
);

// 8. PlaceAutocomplete
content = content.replace(
  /setFormData\(prev => \(\{[\s\S]*?location: place\.displayName \|\| prev\.location\n\s*\}\)\);/m,
  `setValue('address', place.formattedAddress || '', { shouldValidate: true }); setValue('location', place.displayName || location);`
);

// JSX REPLACEMENTS
content = content.replace(/onSubmit=\{handleSubmit\}/g, "onSubmit={formSubmit(onSubmit)}");

content = content.replace(
  /value=\{formData\.title\}\n\s*onChange=\{e => setFormData\(\{ \.\.\.formData, title: e\.target\.value \}\)\}/m,
  `{...register('title')}`
);
content = content.replace(
  /value=\{formData\.date\}\n\s*onChange=\{e => setFormData\(\{ \.\.\.formData, date: e\.target\.value \}\)\}/m,
  `{...register('date')}`
);
content = content.replace(
  /value=\{formData\.time\}\n\s*onChange=\{e => setFormData\(\{ \.\.\.formData, time: e\.target\.value \}\)\}/m,
  `{...register('time')}`
);
content = content.replace(
  /value=\{formData\.location\}\n\s*onChange=\{e => setFormData\(\{ \.\.\.formData, location: e\.target\.value \}\)\}/m,
  `{...register('location')}`
);
content = content.replace(
  /value=\{formData\.address\}\n\s*onChange=\{e => setFormData\(\{ \.\.\.formData, address: e\.target\.value \}\)\}/m,
  `{...register('address')}`
);
content = content.replace(
  /value=\{formData\.publicType\}\n\s*onChange=\{e => setFormData\(\{ \.\.\.formData, publicType: e\.target\.value \}\)\}/m,
  `{...register('publicType')}`
);
content = content.replace(
  /value=\{formData\.description\}\n\s*onChange=\{e => setFormData\(\{ \.\.\.formData, description: e\.target\.value \}\)\}/m,
  `{...register('description')}`
);
content = content.replace(
  /value=\{formData\.whatsappNumber\}\n\s*onChange=\{e => setFormData\(prev => \(\{ \.\.\.prev, whatsappNumber: e\.target\.value \}\)\)\}/m,
  `{...register('whatsappNumber')}`
);
content = content.replace(
  /onClick=\{\(\) => setFormData\(prev => \(\{ \.\.\.prev, hasTickets: !prev\.hasTickets \}\)\)\}/m,
  `onClick={() => setValue('hasTickets', !hasTickets, { shouldValidate: true })}`
);
content = content.replace(/formData\.hasTickets/g, "hasTickets");
content = content.replace(/formData\.mediaUrls/g, "mediaUrls");
content = content.replace(/disabled=\{!formData\.address\}/g, "disabled={!address}");

// Add error messages
content = content.replace(
  /\{id \? 'Salvar Alterações' : 'Publicar Evento'\}/m,
  `{isSubmitting ? <Loader2 className="animate-spin" /> : (id ? 'Salvar Alterações' : 'Publicar Evento')}`
);

fs.writeFileSync(path, content, 'utf8');
console.log('Refactored successfully');
