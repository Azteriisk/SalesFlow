export interface TargetCategory {
  id: string;
  label: string;
  query: string;
  isCustom?: boolean;
}

export function generateAISuggestions(jobTitle: string, companyName: string): TargetCategory[] {
  const title = (jobTitle || '').toLowerCase();
  const company = (companyName || '').toLowerCase();
  const text = `${title} ${company}`;

  const suggestions: TargetCategory[] = [];

  // Match 1: Uniform / Apparel / Linen / Laundry
  if (
    text.includes('uniform') ||
    text.includes('apparel') ||
    text.includes('linen') ||
    text.includes('laundry') ||
    text.includes('garment') ||
    text.includes('textile')
  ) {
    suggestions.push(
      { id: 'suggest_auto', label: 'Auto Repair Shops', query: 'auto repair shop mechanic car garage', isCustom: true },
      { id: 'suggest_warehouse', label: 'Logistics & Warehouses', query: 'warehouse logistics distribution center shipping', isCustom: true },
      { id: 'suggest_manufacturing', label: 'Industrial Plants', query: 'manufacturing factory steel mill plant', isCustom: true },
      { id: 'suggest_restaurant', label: 'Local Restaurants', query: 'restaurant cafe dining pub bistro', isCustom: true },
      { id: 'suggest_laundromat', label: 'Laundromats & Dry Cleaning', query: 'laundromat dry cleaner laundry service', isCustom: true }
    );
  }
  // Match 2: Medical / Health / Clinic / Dental / Hospital / Vet
  else if (
    text.includes('medical') ||
    text.includes('health') ||
    text.includes('doctor') ||
    text.includes('dental') ||
    text.includes('dentist') ||
    text.includes('clinic') ||
    text.includes('hospital') ||
    text.includes('vet') ||
    text.includes('pharma') ||
    text.includes('clinical')
  ) {
    suggestions.push(
      { id: 'suggest_med_office', label: 'Doctor Offices & Clinics', query: 'medical clinic doctor office pediatrician urgent care', isCustom: true },
      { id: 'suggest_dental', label: 'Dental Clinics', query: 'dentist dental clinic dental office', isCustom: true },
      { id: 'suggest_pharmacy', label: 'Pharmacies', query: 'pharmacy drugstore local pharmacy', isCustom: true },
      { id: 'suggest_vet', label: 'Veterinary Clinics', query: 'veterinary clinic animal hospital vet office', isCustom: true },
      { id: 'suggest_senior', label: 'Senior Living & Nursing Homes', query: 'nursing home assisted living senior care retirement', isCustom: true }
    );
  }
  // Match 3: Cleaning / Janitorial / Chemical / Waste / Facilities
  else if (
    text.includes('clean') ||
    text.includes('janitorial') ||
    text.includes('sanitation') ||
    text.includes('chemical') ||
    text.includes('waste') ||
    text.includes('facility') ||
    text.includes('pest') ||
    text.includes('hygiene')
  ) {
    suggestions.push(
      { id: 'suggest_offices', label: 'Corporate & Business Offices', query: 'corporate office business park office building headquarters', isCustom: true },
      { id: 'suggest_school', label: 'Schools & Daycares', query: 'school academy daycare preschool training center', isCustom: true },
      { id: 'suggest_gym', label: 'Gyms & Fitness Centers', query: 'gym fitness center health club yoga crossfit', isCustom: true },
      { id: 'suggest_retail', label: 'Retail & Department Stores', query: 'retail store boutique shop department store supermarket', isCustom: true },
      { id: 'suggest_carwash', label: 'Car Washes & Detailing', query: 'car wash auto detailing detailing service', isCustom: true },
      { id: 'suggest_waste', label: 'Sanitation & Recycling', query: 'waste management recycling sanitation rubbish', isCustom: true }
    );
  }
  // Match 4: Software / SaaS / Tech / IT / Copiers / Consulting / Legal / Accounting
  else if (
    text.includes('software') ||
    text.includes('saas') ||
    text.includes('tech') ||
    text.includes('copier') ||
    text.includes('office') ||
    text.includes('legal') ||
    text.includes('law') ||
    text.includes('accounting') ||
    text.includes('finance') ||
    text.includes('cpa') ||
    text.includes('it')
  ) {
    suggestions.push(
      { id: 'suggest_corp', label: 'Corporate Offices', query: 'corporate office business park office building headquarters', isCustom: true },
      { id: 'suggest_law', label: 'Law & Legal Firms', query: 'law firm attorney lawyer', isCustom: true },
      { id: 'suggest_cpa', label: 'Accounting & CPA Firms', query: 'accounting office CPA accountant', isCustom: true },
      { id: 'suggest_school_it', label: 'Schools & Academies', query: 'school academy college university', isCustom: true }
    );
  }
  // Match 5: Construction / Contractor / HVAC / Plumbing / Roofing / Electrical
  else if (
    text.includes('construct') ||
    text.includes('contractor') ||
    text.includes('hvac') ||
    text.includes('plumb') ||
    text.includes('roof') ||
    text.includes('electric') ||
    text.includes('builder') ||
    text.includes('engineer')
  ) {
    suggestions.push(
      { id: 'suggest_prop_mgr', label: 'Property Managers & Apartments', query: 'property management real estate agency apartment leasing', isCustom: true },
      { id: 'suggest_comm_bldgs', label: 'Commercial Developments', query: 'shopping center office building retail park strip mall', isCustom: true },
      { id: 'suggest_gen_contract', label: 'General Contractors', query: 'construction company general contractor home builder', isCustom: true },
      { id: 'suggest_warehouse_const', label: 'Industrial Warehouses', query: 'warehouse logistics distribution center shipping', isCustom: true }
    );
  }
  // Match 6: Generic Commercial
  else {
    suggestions.push(
      { id: 'suggest_auto_gen', label: 'Auto Repair Shops', query: 'auto repair shop mechanic car garage', isCustom: true },
      { id: 'suggest_restaurant_gen', label: 'Restaurants & Dining', query: 'restaurant cafe dining pub bistro', isCustom: true },
      { id: 'suggest_offices_gen', label: 'Offices & Business Centers', query: 'corporate office business park office building', isCustom: true },
      { id: 'suggest_retail_gen', label: 'Retail Stores', query: 'retail store boutique shop department store', isCustom: true }
    );
  }

  return suggestions;
}
