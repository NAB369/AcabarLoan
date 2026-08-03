// --- 1. CONFIGURATION & MOCK DATA ---
const CONVERSION_RATE = 4000; // $1 USD = 4000 KHR

const KH_PROVINCES = [
    'Banteay Meanchey','Battambang','Kampong Cham','Kampong Chhnang',
    'Kampong Speu','Kampong Thom','Kampot','Kandal','Kep',
    'Koh Kong','Kratié','Mondulkiri','Oddar Meanchey','Pailin',
    'Phnom Penh','Preah Sihanouk','Preah Vihear','Prey Veng',
    'Pursat','Ratanakiri','Siem Reap','Stung Treng','Svay Rieng',
    'Takéo','Tboung Khmum'
];

const KH_DISTRICTS = {
    'Banteay Meanchey': ['Mongkol Borei','Ou Chrov','Paoy Paet','Phnom Srok','Preah Net Preah','Serei Saophoan','Svay Chek','Thma Puok'],
    'Battambang': ['Banan','Battambang','Bavel','Ek Phnom','Kamrieng','Koas Krala','Maung Russei','Phnom Proek','Ratanak Mondol','Samlaut','Sampov Meas','Sangkae','Thmor Koul','Veal Veng'],
    'Kampong Cham': ['Batheay','Chamkar Leu','Cheung Prey','Kampong Cham','Kang Meas','Koh Sautin','Memot','Ponhea Kraek','Prey Chhor','Srey Santhor','Stueng Trang'],
    'Kampong Chhnang': ['Baribour','Kampong Chhnang','Kampong Leaeng','Kampong Tralach','Rolea Pa\'ek','Samaki Meanchey','Tuek Phos'],
    'Kampong Speu': ['Aoral','Basedth','Chbar Mon','Kong Pisei','Oral','Phnom Sruoch','Samraong Tong','Thpong'],
    'Kampong Thom': ['Baray','Kampong Svay','Kampong Thom','Prasat Balangk','Prasat Sambour','Santuk','Stung Sen'],
    'Kampot': ['Angkor Chey','Banteay Meas','Chhouk','Dang Tong','Kampot','Kirivong','Kompong Trach','Teuk Chhou'],
    'Kandal': ['Ang Snuol','Kandal Stueng','Kien Svay','Khsach Kandal','Koh Thom','Leuk Daek','Lvea Em','Mok Kampul','Ponhea Leu','S\'ang','Ta Khmau'],
    'Kep': ['Damnak Chang\'aeur','Kep'],
    'Koh Kong': ['Botum Sakor','Kaoh Kong','Kiri Sakor','Mondol Seima','Smach Mean Chey','Sre Ambel','Thma Bang'],
    'Kratié': ['Chhloung','Kracheh','Kratié','Preaek Prasab','Sambour','Snuol'],
    'Mondulkiri': ['Keo Seima','Ou Reang','Pech Chreada','Phnom Prich','Sen Monorom'],
    'Oddar Meanchey': ['Anlong Veng','Banteay Ampil','Chong Kal','Samraong','Trapeang Prasat'],
    'Pailin': ['Pailin','Sala Krau'],
    'Phnom Penh': ['Boeng Keng Kang','Chamkar Mon','Chrouy Changvar','Dangkao','Doun Penh','Kamboul','Mean Chey','Por Senchey','Prek Pnov','Prampir Meakkakra','Russey Keo','Saensokh','Tuol Kouk'],
    'Preah Sihanouk': ['Prey Nob','Sihanoukville','Stueng Hav'],
    'Preah Vihear': ['Chhaeb','Choam Ksan','Kulen','Preah Vihear','Rovieng','Sangkum Thmei','Tbeng Meanchey'],
    'Prey Veng': ['Ba Phnum','Kamchay Mear','Kampong Trabaek','Kanhchriech','Me Sang','Peam Chor','Peam Ro','Pea Reang','Preah Sdach','Prey Veng','Pur Rieng','Sithor Kandal','Svay Antor'],
    'Pursat': ['Bakan','Kandieng','Krakor','Phnom Kravanh','Pursat','Veal Veng'],
    'Ratanakiri': ['Andong Meas','Ban Lung','Bar Kaev','Koun Mom','Lumphat','O Chum','O Ya Dav','Ta Veng','Veun Sai'],
    'Siem Reap': ['Angkor Chum','Angkor Thom','Banteay Srei','Chi Kraeng','Kralanh','Prasat Bakong','Puok','Siem Reap','Soutr Nikom','Srey Snam','Svay Leu','Varin'],
    'Stung Treng': ['Sesan','Siem Bouk','Siem Pang','Stung Treng','Thala Barivat'],
    'Svay Rieng': ['Chantrea','Kampong Rou','Romeas Haek','Svay Chrum','Svay Rieng','Svay Teab'],
    'Takéo': ['Angkor Borei','Bati','Borei Cholsar','Daun Keo','Kaoh Andaet','Kirivong','Prey Kabbas','Samraong','Tram Kak','Treang'],
    'Tboung Khmum': ['Dambae','Krouch Chhmar','Memot','Ou Reang Ov','Ponhea Kraek','Stueng Trang','Suong','Tbong Khmum'],
};

const KH_COMMUNES = {
    // Phnom Penh
    'Boeng Keng Kang': ['Boeng Keng Kang 1','Boeng Keng Kang 2','Boeng Keng Kang 3'],
    'Chamkar Mon': ['Beong Trobek','Olympic','Tonle Bassac','Toul Svay Prey 1','Toul Svay Prey 2','Toul Tumpung 1','Toul Tumpung 2','Tumnob Tuek'],
    'Chrouy Changvar': ['Chroy Changvar','Kaoh Norea','Preaek Thmey','Prek Leab','Prek Ta Sek'],
    'Dangkao': ['Chaom Chau','Cheung Aek','Dangkao','Kork Khleang','Nirouth','Prek Ho','Prek Ta Sek','Prey Sa','Robib','Samrong Kraom','Spean Thhmaa'],
    'Doun Penh': ['Chakto Mukh','Phsar Kandal 1','Phsar Kandal 2','Phsar Thmei 1','Phsar Thmei 2','Phsar Thmei 3','Srah Chak','Wat Phnom'],
    'Kamboul': ['Ansa Champa','Kamboul','Krang Thnong','Prey Sar','Ta Khmau'],
    'Mean Chey': ['Boeng Tumpun 1','Boeng Tumpun 2','Chak Angrae Kraom','Chak Angrae Leu','Prey Veaeng','Stung Meanchey 1','Stung Meanchey 2','Stung Meanchey 3'],
    'Por Senchey': ['Cheung Aek','Kakap','Kouk Roka','Nirouth','Preaek Phnov','Prey Veng','Samraong Kraom'],
    'Prek Pnov': ['Preaek Phnov','Rok Khnong','Sambuor Meas','Stung Mean Chey'],
    'Prampir Meakkakra': ['Boeung Kak 1','Boeung Kak 2','Boeung Prolit','Mittapheap','Monorom','Veal Vong'],
    'Russey Keo': ['Kilometre 6','Russey Keo','Toul Sangkae 1','Toul Sangkae 2','Tuek Thla'],
    'Saensokh': ['Kork Kleang','Phnom Penh Thmei','Teuk Thla','Tuek L\'ak 1','Tuek L\'ak 2','Tuek L\'ak 3'],
    'Tuol Kouk': ['Boeng Kak 1','Boeng Kak 2','Phsar Depou 1','Phsar Depou 2','Phsar Depou 3','Tuek L\'ak 1','Tuek L\'ak 2','Tuek L\'ak 3'],
    // Siem Reap
    'Siem Reap': ['Chreav','Khnar','Kouk Chak','Sala Kamraeuk','Siem Reap','Slor Kram','Srangae','Svay Dangkum','Ta Phul','Treang'],
    'Angkor Chum': ['Angkor Chum','Khnach Romeas','Kouk Doung','Ta Saom','Troung'],
    'Angkor Thom': ['Angkor Thom','Bak Kheng','Kon Dor','Srob'],
    'Banteay Srei': ['Banteay Srei','Khnach','Kouk Nang','Prum','Svay Leu'],
    'Puok': ['Chrey','Kouk Thlok','Nokor Bachei','Puok','Sla Kram','Ta Ek'],
    // Battambang
    'Battambang': ['Boeung Chhouk','Kdol','Kmeng','Preaek Mohatep','Ratanak','Svay Por','Tatai Leu'],
    'Bavel': ['Bavel','Kdol','Phnov','Trang'],
    'Maung Russei': ['Kamrieng','Kouk Khmum','Maung Russei','Ou Char','Rekha Ksei','Svay Pak'],
    // Kampong Cham
    'Kampong Cham': ['Boeng Kok','Kampong Cham','Kampong Reab','Kaoh Soutin','Kdei Chunh','Kien Sangke','Kouk Rovieng','Phum Thmei','Preaek Thmei','Vihear Suos'],
    'Cheung Prey': ['Cheung Prey','Kouk Chak','Prek Ho','Tbong Khmum'],
    // Kandal
    'Ta Khmau': ['Preaek Ho','Preaek Luong','Svay Rolum','Ta Khmau','Takhmao'],
    'Ang Snuol': ['Ang Snuol','Baek Chan','Kaoh Thom','Kokir','Preaek Ambel','Sambour'],
    'Kien Svay': ['Kien Svay','Kouk Rovieng','Preaek Ampil','Prey Chichak','Svay Chrum'],
    'Khsach Kandal': ['Khsach Kandal','Kouk Khleang','Kouk Roka','Preaek Ambel'],
    'Koh Thom': ['Koh Thom','Preaek Sdach','Preaek Ta Sek','Svay Antor'],
    // Kampot
    'Kampot': ['Andoung Khmer','Boeng Seang','Chambok','Kampot','Lpov','Prey Thom','Toek Chhou'],
    'Teuk Chhou': ['Chhuk','Chum Kiri','Kompong Trach','Teuk Chhou'],
    // Preah Sihanouk
    'Sihanoukville': ['Bei','Buon','Mittapheap','Muoy','Pir','Tumnup Rolok'],
    'Prey Nob': ['Bit Traing','Prey Nob','Ruessei Srok','Stueng Hav'],
    // Kampong Speu
    'Chbar Mon': ['Chbar Mon','Kdol','Roleang Cheung','Samraong','Veal Renh'],
    'Kong Pisei': ['Kong Pisei','Roka Khpos','Samraong','Toul Sdey'],
    // Kampong Thom
    'Stung Sen': ['Kampong Roteh','Sambo','Stung Sen','Taing Krasaing'],
    'Baray': ['Baray','Chhuk','Kouk Pring','Sandan'],
    // Kampong Chhnang
    'Kampong Chhnang': ['Boeng Khnar','Kampong Chhnang','Kaoh Bandan','Phlang Moan','Samaki Meanchey'],
    // Pursat
    'Pursat': ['Kansaeng','Phsar Chhnouk','Pursat','Rolous','Svay At'],
    'Krakor': ['Anlong Vil','Krakor','Phteah Rung','Svay Chek'],
    // Takéo
    'Daun Keo': ['Daun Keo','Kdol Tahen','Phumi Thmei','Prey Angkunh','Roka Knong','Takeo'],
    'Angkor Borei': ['Angkor Borei','Kdol','Prey Kabas','Treang'],
    // Prey Veng
    'Prey Veng': ['Koh Chiveang','Prey Veng','Svay Teab','Tboung Krapeu','Tonle Bet'],
    'Peam Ro': ['Kouk Romiet','Peam Ro','Svay Chrum','Ta Phos'],
    // Svay Rieng
    'Svay Rieng': ['Neak Loeung','Svay Rieng','Svay Tep','Svay Toeur'],
    'Romeas Haek': ['Chantrea','Romeas Haek','Svay Chrum'],
    // Kratié
    'Kratié': ['Kratié','Ou Svay','Preaek Prasab','Sameakki'],
    'Chhloung': ['Chhloung','Sambour','Snuol'],
    // Stung Treng
    'Stung Treng': ['Stung Treng','Thala Barivat'],
    // Ratanakiri
    'Ban Lung': ['Ban Lung','Labansiek','Yeak Lom'],
    'Lumphat': ['Lumphat','O Chum','Ta Veng'],
    // Mondulkiri
    'Sen Monorom': ['Kaoh Nheaek','Ou Reang','Sen Monorom'],
    // Preah Vihear
    'Tbeng Meanchey': ['Chhep','Khvav','Thmar Puok','Tbeng Meanchey'],
    // Oddar Meanchey
    'Samraong': ['Samraong','Ou Ambel','Trapeang Tav'],
    'Anlong Veng': ['Anlong Veng','Kouk Romiet','Trapeang Tav'],
    // Pailin
    'Pailin': ['Pailin','Phnum Preal','Sala Krau'],
    // Banteay Meanchey
    'Serei Saophoan': ['Kampong Svay','Kouk Khleang','Ou Ambel','Serei Saophoan'],
    'Paoy Paet': ['Banteay Neang','O Chrov','Paoy Paet','Poipet'],
    // Tboung Khmum
    'Tbong Khmum': ['Ou Reang Ov','Ponhea Kraek','Suong','Tbong Khmum'],
    'Memot': ['Dambae','Krouch Chhmar','Memot','Stueng Trang'],
};

function populateDistricts(prefix) {
    const province = document.getElementById(`w-${prefix}-province`)?.value;
    const districtSel = document.getElementById(`w-${prefix}-district`);
    if (!districtSel) return;
    const districts = (province && KH_DISTRICTS[province]) || [];
    districtSel.innerHTML = districts.length
        ? '<option value="">-- Select District --</option>' + districts.map(d => `<option value="${d}">${d}</option>`).join('')
        : '<option value="">-- Select Province first --</option>';
    populateCommunes(prefix);
}

function populateCommunes(prefix) {
    const district = document.getElementById(`w-${prefix}-district`)?.value;
    const communeSel = document.getElementById(`w-${prefix}-commune`);
    if (!communeSel) return;
    const communes = (district && KH_COMMUNES[district]) || [];
    communeSel.innerHTML = communes.length
        ? '<option value="">-- Select Commune --</option>' + communes.map(c => `<option value="${c}">${c}</option>`).join('')
        : '<option value="">-- Select District first --</option>';
}

function composeAddress(prefix) {
    const g = id => document.getElementById(`w-${prefix}-${id}`)?.value?.trim() || '';
    const parts = [
        g('house') ? `#${g('house')}` : '',
        g('street') ? `St.${g('street')}` : '',
        g('village'),
        g('commune'),
        g('district'),
        g('province')
    ].filter(Boolean);
    return parts.join(', ');
}

function formatAddress(addr) {
    if (!addr) return null;
    if (typeof addr === 'string') return addr;
    const parts = [
        addr.house ? `#${addr.house}` : null,
        addr.street ? `St.${addr.street}` : null,
        addr.village, addr.commune, addr.district, addr.province
    ].filter(Boolean);
    return parts.join(', ') || null;
}

let state = {
    activeTab: 'dashboard',
    activeSettingsMenu: 'user-management', // settings sub-menu id
    activeUserMgmtSubMenu: 'user-accounts',
    currency: 'USD', // 'USD' or 'KHR'
    loanApplications: [],
    borrowers: [
        {
            code: 'CID-000001',
            khName: 'ចាន់ សុភ័គ',
            enName: 'CHAN SOPHEAK',
            gender: 'Male',
            maritalStatus: 'Married',
            dob: '1988-05-12',
            idType: 'National ID',
            idNo: '018805121234',
            phone: '012 456 789',
            email: 'chan.sopheak@gmail.com',
            currentAddress: {
                province: 'Phnom Penh',
                district: 'Doun Penh',
                commune: 'Wat Phnom',
                village: 'Phsar Thmei',
                house: '24',
                street: '92'
            },
            permanentAddress: {
                province: 'Kandal',
                district: 'Ta Khmau',
                commune: 'Ta Khmau',
                village: 'Preaek Ho',
                house: '08',
                street: '01'
            },
            occupation: 'Business Owner',
            employmentStatus: 'Self-Employed',
            monthlyIncome: '3500',
            otherIncome: '800',
            collateralType: 'Land Title',
            collateralValue: '32000',
            collateralDocNo: 'LT-2024-00178',
            collateralDescription: 'Land plot 400 sqm at Preaek Ho, Ta Khmau, Kandal',
            coBorrower: {
                khName: 'ចាន់ ច័ន្ទនី',
                enName: 'CHAN CHANTNY',
                dob: '1991-09-20',
                gender: 'Female',
                idType: 'National ID',
                idNo: '019109208765',
                relation: 'Spouse',
                phone: '011 334 556',
                email: '',
                maritalStatus: 'Married',
                currentAddress: 'Same as Borrower',
                permanentAddress: 'Same as Borrower',
                occupation: 'Teacher',
                employmentStatus: 'Employed',
                monthlyIncome: '900',
                otherIncome: ''
            },
            guarantor: {
                khName: 'ស៊ុន ចាន់',
                enName: 'SUN CHAN',
                dob: '1960-03-08',
                gender: 'Male',
                idType: 'National ID',
                idNo: '016003081111',
                relation: 'Father',
                phone: '017 888 222',
                email: '',
                currentAddress: '#08, St.01, Preaek Ho, Ta Khmau, Kandal',
                permanentAddress: '#08, St.01, Preaek Ho, Ta Khmau, Kandal'
            },
            status: 'Active'
        },
        {
            code: 'CID-000002',
            khName: 'កែវ សុភា',
            enName: 'KEO SOPHEA',
            gender: 'Female',
            maritalStatus: 'Married',
            dob: '1992-07-18',
            idType: 'National ID',
            idNo: '019207182345',
            phone: '015 678 901',
            email: 'keo.sophea@gmail.com',
            currentAddress: { province: 'Siem Reap', district: 'Siem Reap', commune: 'Svay Dankum', village: 'Sala Kamreuk', house: '12', street: '07' },
            permanentAddress: { province: 'Siem Reap', district: 'Angkor Chum', commune: 'Kork', village: 'Thlok', house: '03', street: '' },
            occupation: 'Shop Owner',
            employmentStatus: 'Self-Employed',
            monthlyIncome: '2200',
            otherIncome: '400',
            collateralType: 'Vehicle',
            collateralValue: '8000',
            collateralDocNo: 'VH-2024-00456',
            collateralDescription: 'Toyota Camry 2019, Plate PP-3456',
            coBorrower: {},
            guarantor: {},
            documents: [],
            status: 'Active'
        },
        {
            code: 'CID-000003',
            khName: 'សេង ហុង',
            enName: 'SENG HONG',
            gender: 'Male',
            maritalStatus: 'Single',
            dob: '1995-03-25',
            idType: 'National ID',
            idNo: '019503251567',
            phone: '098 234 567',
            email: 'seng.hong@yahoo.com',
            currentAddress: { province: 'Battambang', district: 'Battambang', commune: 'Svay Por', village: 'Sdao', house: '45', street: '03' },
            permanentAddress: { province: 'Battambang', district: 'Battambang', commune: 'Svay Por', village: 'Sdao', house: '45', street: '03' },
            occupation: 'Farmer',
            employmentStatus: 'Self-Employed',
            monthlyIncome: '1200',
            otherIncome: '300',
            collateralType: 'Land Title',
            collateralValue: '15000',
            collateralDocNo: 'LT-2023-00789',
            collateralDescription: 'Rice paddy 2 hectares, Svay Por commune, Battambang',
            coBorrower: {},
            guarantor: {
                khName: 'សេង ស្រីម៉ៅ',
                enName: 'SENG SREYMAO',
                dob: '1965-11-01',
                gender: 'Female',
                idType: 'National ID',
                idNo: '016511011234',
                relation: 'Mother',
                phone: '017 456 789',
                email: '',
                currentAddress: '#45, St.03, Sdao, Svay Por, Battambang',
                permanentAddress: '#45, St.03, Sdao, Svay Por, Battambang'
            },
            documents: [],
            status: 'Active'
        },
        {
            code: 'CID-000004',
            khName: 'មុន្នី រតនា',
            enName: 'MUNNY ROTHANA',
            gender: 'Female',
            maritalStatus: 'Married',
            dob: '1989-12-05',
            idType: 'Passport',
            idNo: 'A2345678',
            phone: '012 987 654',
            email: 'munny.rothana@gmail.com',
            currentAddress: { province: 'Phnom Penh', district: 'Tuol Kouk', commune: 'Tuek L\'ak Ti Muoy', village: 'Boeng Kak', house: '78', street: '271' },
            permanentAddress: { province: 'Kampong Cham', district: 'Kampong Cham', commune: 'Kampong Cham', village: 'Prey Chhor', house: '12', street: '' },
            occupation: 'Accountant',
            employmentStatus: 'Employed',
            monthlyIncome: '2800',
            otherIncome: '',
            collateralType: 'Fixed Deposit',
            collateralValue: '5000',
            collateralDocNo: 'FD-2024-00112',
            collateralDescription: 'Fixed deposit account at Acabar Bank, $5,000',
            coBorrower: {},
            guarantor: {},
            documents: [],
            status: 'Approved'
        },
        {
            code: 'CID-000005',
            khName: 'លីម គីមហ័រ',
            enName: 'LIM KIMHOUR',
            gender: 'Male',
            maritalStatus: 'Married',
            dob: '1983-08-14',
            idType: 'National ID',
            idNo: '018308141890',
            phone: '016 345 678',
            email: 'lim.kimhour@business.com',
            currentAddress: { province: 'Phnom Penh', district: 'Chamkar Mon', commune: 'Tonle Basak', village: 'Boeung Keng Kang', house: '22A', street: '310' },
            permanentAddress: { province: 'Takeo', district: 'Tram Kak', commune: 'Rou Ssei', village: 'Roup Sour', house: '06', street: '' },
            occupation: 'Restaurant Owner',
            employmentStatus: 'Self-Employed',
            monthlyIncome: '6000',
            otherIncome: '1500',
            collateralType: 'Commercial Property',
            collateralValue: '65000',
            collateralDocNo: 'CP-2022-00334',
            collateralDescription: '3-storey shophouse, 4.5m x 20m, Chamkar Mon, Phnom Penh',
            coBorrower: {
                khName: 'លីម ចន្ទ្រា',
                enName: 'LIM CHANTREA',
                dob: '1986-04-22',
                gender: 'Female',
                idType: 'National ID',
                idNo: '018604221445',
                relation: 'Spouse',
                phone: '016 890 123',
                email: 'lim.chantrea@gmail.com',
                maritalStatus: 'Married',
                currentAddress: 'Same as Borrower',
                permanentAddress: 'Same as Borrower',
                occupation: 'Homemaker',
                employmentStatus: 'Unemployed',
                monthlyIncome: '',
                otherIncome: ''
            },
            guarantor: {},
            documents: [],
            status: 'Active'
        },
        {
            code: 'CID-000006',
            khName: 'ចាន់ ធារី',
            enName: 'CHAN THEARY',
            gender: 'Female',
            maritalStatus: 'Single',
            dob: '1998-02-28',
            idType: 'National ID',
            idNo: '019802285678',
            phone: '089 112 334',
            email: 'chan.theary@student.edu.kh',
            currentAddress: { province: 'Phnom Penh', district: 'Meanchey', commune: 'Chak Angre Leu', village: 'Phum 7', house: '33', street: '369' },
            permanentAddress: { province: 'Kampot', district: 'Kampot', commune: 'Andoung Khmer', village: 'Chrey', house: '08', street: '' },
            occupation: 'Small Business Trader',
            employmentStatus: 'Self-Employed',
            monthlyIncome: '900',
            otherIncome: '',
            collateralType: 'Vehicle',
            collateralValue: '4500',
            collateralDocNo: 'VH-2024-00789',
            collateralDescription: 'Honda Dream motorcycle 2022, Plate SR-6677',
            coBorrower: {},
            guarantor: {},
            documents: [],
            status: 'Pending'
        },
        {
            code: 'CID-000007',
            khName: 'ហេង សុភ័គ',
            enName: 'HENG SOPHEAK',
            gender: 'Male',
            maritalStatus: 'Married',
            dob: '1980-10-10',
            idType: 'National ID',
            idNo: '018010101234',
            phone: '011 567 890',
            email: 'heng.sopheak@gmail.com',
            currentAddress: { province: 'Kampong Speu', district: 'Chbar Mon', commune: 'Chbar Mon', village: 'Khum Leu', house: '14', street: '02' },
            permanentAddress: { province: 'Kampong Speu', district: 'Chbar Mon', commune: 'Chbar Mon', village: 'Khum Leu', house: '14', street: '02' },
            occupation: 'Carpenter',
            employmentStatus: 'Self-Employed',
            monthlyIncome: '1800',
            otherIncome: '200',
            collateralType: 'Land Title',
            collateralValue: '22000',
            collateralDocNo: 'LT-2023-00456',
            collateralDescription: 'Residential land plot 300 sqm, Chbar Mon, Kampong Speu',
            coBorrower: {},
            guarantor: {},
            documents: [],
            status: 'Active'
        }
    ],
    loanApplications: [
        {
            ref: 'AC-L-001001',
            borrowerCode: 'CID-000001',
            borrowerName: 'CHAN SOPHEAK',
            borrowerKhName: 'ចាន់ សុភ័គ',
            borrowerGender: 'Male',
            borrowerPhone: '012 456 789',
            borrowerEmail: 'chan.sopheak@gmail.com',
            product: 'Business Loan',
            currency: 'USD',
            amount: 15000,
            disbursementDate: '2026-01-15',
            repaymentType: 'Monthly',
            firstInstallment: '2026-02-15',
            installments: 24,
            interestRate: 18,
            penaltyRate: 5,
            creditOfficer: 'Vuthy Sok',
            collateral: 'Land Title',
            loanCycle: '2',
            branch: 'Phnom Penh HQ',
            reasonCredit: 'Expand retail shop inventory and renovate shopfront',
            memoReason: 'Good repayment history. Collateral verified.',
            emi: 748.49,
            schedule: [],
            status: 'Approved',
            submittedAt: '2026-01-10T08:30:00.000Z',
            approvalState: 3,
            approvalHistory: [
                { stage: 1, action: 'Application submitted', user: 'Vuthy Sok', timestamp: '10/01/2026, 08:30:00' },
                { stage: 2, action: 'Credit review passed', user: 'Srey Neang', timestamp: '12/01/2026, 10:15:00' },
                { stage: 3, action: 'Final approval granted', user: 'Admin', timestamp: '14/01/2026, 14:00:00' }
            ]
        },
        {
            ref: 'AC-L-001002',
            borrowerCode: 'CID-000002',
            borrowerName: 'KEO SOPHEA',
            borrowerKhName: 'កែវ សុភា',
            borrowerGender: 'Female',
            borrowerPhone: '015 678 901',
            borrowerEmail: 'keo.sophea@gmail.com',
            product: 'Agricultural Loan',
            currency: 'USD',
            amount: 5000,
            disbursementDate: '2026-02-10',
            repaymentType: 'Monthly',
            firstInstallment: '2026-03-10',
            installments: 12,
            interestRate: 16,
            penaltyRate: 4,
            creditOfficer: 'Vuthy Sok',
            collateral: 'Vehicle',
            loanCycle: '1',
            branch: 'Siem Reap Branch',
            reasonCredit: 'Purchase of farming equipment and seasonal seeds',
            memoReason: 'First-time borrower with stable shop income.',
            emi: 453.83,
            schedule: [],
            status: 'Approved',
            submittedAt: '2026-02-05T09:00:00.000Z',
            approvalState: 3,
            approvalHistory: [
                { stage: 1, action: 'Application submitted', user: 'Vuthy Sok', timestamp: '05/02/2026, 09:00:00' },
                { stage: 2, action: 'Credit review passed', user: 'Srey Neang', timestamp: '07/02/2026, 11:00:00' },
                { stage: 3, action: 'Final approval granted', user: 'Admin', timestamp: '09/02/2026, 15:30:00' }
            ]
        },
        {
            ref: 'AC-L-001003',
            borrowerCode: 'CID-000003',
            borrowerName: 'SENG HONG',
            borrowerKhName: 'សេង ហុង',
            borrowerGender: 'Male',
            borrowerPhone: '098 234 567',
            borrowerEmail: 'seng.hong@yahoo.com',
            product: 'Agricultural Loan',
            currency: 'USD',
            amount: 3000,
            disbursementDate: '2026-03-01',
            repaymentType: 'Monthly',
            firstInstallment: '2026-04-01',
            installments: 12,
            interestRate: 16,
            penaltyRate: 4,
            creditOfficer: 'Vuthy Sok',
            collateral: 'Land Title',
            loanCycle: '1',
            branch: 'Battambang Branch',
            reasonCredit: 'Seasonal farming inputs — fertilizer, seeds, labour',
            memoReason: 'Collateral valued at $15,000. Low risk profile.',
            emi: 272.30,
            schedule: [],
            status: 'Disbursed',
            submittedAt: '2026-02-25T10:00:00.000Z',
            approvalState: 3,
            approvalHistory: [
                { stage: 1, action: 'Application submitted', user: 'Vuthy Sok', timestamp: '25/02/2026, 10:00:00' },
                { stage: 2, action: 'Credit review passed', user: 'Srey Neang', timestamp: '27/02/2026, 13:00:00' },
                { stage: 3, action: 'Disbursed', user: 'Admin', timestamp: '01/03/2026, 08:00:00' }
            ]
        },
        {
            ref: 'AC-L-001004',
            borrowerCode: 'CID-000005',
            borrowerName: 'LIM KIMHOUR',
            borrowerKhName: 'លីម គីមហ័រ',
            borrowerGender: 'Male',
            borrowerPhone: '016 345 678',
            borrowerEmail: 'lim.kimhour@business.com',
            product: 'SME Loan',
            currency: 'USD',
            amount: 25000,
            disbursementDate: '2025-12-01',
            repaymentType: 'Monthly',
            firstInstallment: '2026-01-01',
            installments: 36,
            interestRate: 15,
            penaltyRate: 5,
            creditOfficer: 'Srey Neang',
            collateral: 'Commercial Property',
            loanCycle: '3',
            branch: 'Phnom Penh HQ',
            reasonCredit: 'Restaurant expansion — kitchen equipment and fit-out of second branch',
            memoReason: 'Strong financial profile. Third loan cycle. Excellent track record.',
            emi: 866.19,
            schedule: [],
            status: 'Disbursed',
            submittedAt: '2025-11-20T07:30:00.000Z',
            approvalState: 3,
            approvalHistory: [
                { stage: 1, action: 'Application submitted', user: 'Srey Neang', timestamp: '20/11/2025, 07:30:00' },
                { stage: 2, action: 'Credit review passed', user: 'Srey Neang', timestamp: '24/11/2025, 10:00:00' },
                { stage: 3, action: 'Disbursed', user: 'Admin', timestamp: '01/12/2025, 09:00:00' }
            ]
        },
        {
            ref: 'AC-L-001005',
            borrowerCode: 'CID-000006',
            borrowerName: 'CHAN THEARY',
            borrowerKhName: 'ចាន់ ធារី',
            borrowerGender: 'Female',
            borrowerPhone: '089 112 334',
            borrowerEmail: 'chan.theary@student.edu.kh',
            product: 'Personal Loan',
            currency: 'USD',
            amount: 2000,
            disbursementDate: '2026-06-15',
            repaymentType: 'Monthly',
            firstInstallment: '2026-07-15',
            installments: 12,
            interestRate: 20,
            penaltyRate: 6,
            creditOfficer: 'Vuthy Sok',
            collateral: 'Vehicle',
            loanCycle: '1',
            branch: 'Phnom Penh HQ',
            reasonCredit: 'Working capital for market stall restocking',
            memoReason: 'First-time applicant. Collateral assessed.',
            emi: 184.97,
            schedule: [],
            status: 'Pending Approval',
            submittedAt: '2026-06-20T14:00:00.000Z',
            approvalState: 1,
            approvalHistory: [
                { stage: 1, action: 'Application submitted', user: 'Vuthy Sok', timestamp: '20/06/2026, 14:00:00' }
            ]
        },
        {
            ref: 'AC-L-001006',
            borrowerCode: 'CID-000007',
            borrowerName: 'HENG SOPHEAK',
            borrowerKhName: 'ហេង សុភ័គ',
            borrowerGender: 'Male',
            borrowerPhone: '011 567 890',
            borrowerEmail: 'heng.sopheak@gmail.com',
            product: 'Business Loan',
            currency: 'USD',
            amount: 8000,
            disbursementDate: '2026-04-20',
            repaymentType: 'Monthly',
            firstInstallment: '2026-05-20',
            installments: 18,
            interestRate: 17,
            penaltyRate: 5,
            creditOfficer: 'Srey Neang',
            collateral: 'Land Title',
            loanCycle: '2',
            branch: 'Phnom Penh HQ',
            reasonCredit: 'Purchase of woodworking machinery and tools',
            memoReason: 'Stable self-employed income. Second cycle borrower.',
            emi: 519.71,
            schedule: [],
            status: 'Approved',
            submittedAt: '2026-04-15T11:00:00.000Z',
            approvalState: 3,
            approvalHistory: [
                { stage: 1, action: 'Application submitted', user: 'Srey Neang', timestamp: '15/04/2026, 11:00:00' },
                { stage: 2, action: 'Credit review passed', user: 'Srey Neang', timestamp: '17/04/2026, 09:30:00' },
                { stage: 3, action: 'Final approval granted', user: 'Admin', timestamp: '19/04/2026, 16:00:00' }
            ]
        }
    ],
    expenses: [
        { code: 'EXP-000001', category: 'Staff Salaries', amount: 4200, date: '2026-06-01', description: 'Monthly staff payroll — June 2026', account: '5001' },
        { code: 'EXP-000002', category: 'Office Rent',    amount: 1500, date: '2026-06-01', description: 'Phnom Penh HQ monthly rent',         account: '5002' },
        { code: 'EXP-000003', category: 'Utilities',      amount: 380,  date: '2026-06-05', description: 'Electricity & internet — June',       account: '5003' },
        { code: 'EXP-000004', category: 'Staff Salaries', amount: 2100, date: '2026-05-01', description: 'Monthly staff payroll — May 2026',    account: '5001' },
        { code: 'EXP-000005', category: 'Office Supplies',amount: 215,  date: '2026-05-10', description: 'Stationery and print cartridges',     account: '5004' },
        { code: 'EXP-000006', category: 'Travel & Transport', amount: 340, date: '2026-05-18', description: 'Field visit — Battambang Branch',  account: '5005' },
        { code: 'EXP-000007', category: 'Office Rent',    amount: 1500, date: '2026-05-01', description: 'Phnom Penh HQ monthly rent — May',    account: '5002' },
        { code: 'EXP-000008', category: 'Utilities',      amount: 410,  date: '2026-04-05', description: 'Electricity & internet — April',      account: '5003' },
    ],
    incomes: [
        { code: 'INC-000001', category: 'Interest Income',   amount: 3840, date: '2026-06-15', description: 'Monthly interest collected — June 2026',  account: '4001' },
        { code: 'INC-000002', category: 'Loan Fees',         amount: 1250, date: '2026-06-10', description: 'Processing fees — 3 new disbursements',    account: '4002' },
        { code: 'INC-000003', category: 'Late Penalty Fees', amount: 185,  date: '2026-06-20', description: 'Penalty collected from 2 overdue loans',   account: '4003' },
        { code: 'INC-000004', category: 'Interest Income',   amount: 3650, date: '2026-05-15', description: 'Monthly interest collected — May 2026',    account: '4001' },
        { code: 'INC-000005', category: 'Loan Fees',         amount: 800,  date: '2026-05-05', description: 'Processing fees — 2 new disbursements',    account: '4002' },
        { code: 'INC-000006', category: 'Interest Income',   amount: 3500, date: '2026-04-15', description: 'Monthly interest collected — April 2026',  account: '4001' },
        { code: 'INC-000007', category: 'Late Penalty Fees', amount: 95,   date: '2026-04-22', description: 'Penalty collected — 1 overdue account',    account: '4003' },
    ],
    parReport: [
        { bucket: 'Current (0 Days)',          accounts: 0, outstanding: 0, arrears: 0, class: 'Normal',          rate: 0.01 },
        { bucket: '1-30 Days Arrears',         accounts: 0, outstanding: 0, arrears: 0, class: 'Special Mention', rate: 0.03 },
        { bucket: '31-60 Days Arrears',        accounts: 0, outstanding: 0, arrears: 0, class: 'Sub-Standard',    rate: 0.20 },
        { bucket: '61-90 Days Arrears',        accounts: 0, outstanding: 0, arrears: 0, class: 'Doubtful',        rate: 0.50 },
        { bucket: '90+ Days Arrears (Default)',accounts: 0, outstanding: 0, arrears: 0, class: 'Loss / Write-off',rate: 1.00 }
    ],
    roleMatrix: {
        'Credit Manager': {
            'add_borrower': true,
            'disburse_loan': true,
            'write_off': true,
            'run_operations': true,
            'view_accounting': true
        },
        'Admin': {
            'add_borrower': true,
            'disburse_loan': true,
            'write_off': true,
            'run_operations': true,
            'view_accounting': true
        },
        'Loan Officer': {
            'add_borrower': true,
            'disburse_loan': false,
            'write_off': false,
            'run_operations': false,
            'view_accounting': false
        }
    },
    notifications: [],
    wizardStep: 1,
    loanWizardStep: 1,
    loanSubmitted: false,
    activeAccountingCard: 'accountant',
    activeLoan: null,
    approvalState: 1,
    approvalHistory: [],
    activeStatement: 'pl',
    selectedRole: 'Credit Manager',
    userStatusFilter: 'all',
    editingBorrowerCode: null,
    editingLoanRef: null,
    deletePendingCode: null,
    borrowerPage: 1,
    borrowerPageSize: 10,
    systemUsers: [
        { username: 'admin', fullName: 'System Administrator', role: 'Admin', branch: 'Phnom Penh HQ', department: 'IT', lastLogin: '2026-06-24 08:15', status: 'Active', statusChanged: '2026-01-10' },
        { username: 'sreyneang', fullName: 'Srey Neang', role: 'Credit Manager', branch: 'Phnom Penh HQ', department: 'Credit', lastLogin: '2026-06-24 07:42', status: 'Active', statusChanged: '2026-03-15' },
        { username: 'vuthy', fullName: 'Vuthy Sok', role: 'Loan Officer', branch: 'Siem Reap Branch', department: 'Operations', lastLogin: '2026-06-23 17:30', status: 'Active', statusChanged: '2026-02-20' },
        { username: 'dara', fullName: 'Dara Kim', role: 'Loan Officer', branch: 'Battambang Branch', department: 'Operations', lastLogin: '2026-06-20 09:00', status: 'Inactive', statusChanged: '2026-06-18' },
        { username: 'chantha', fullName: 'Chantha Meas', role: 'Loan Officer', branch: 'Phnom Penh HQ', department: 'Collections', lastLogin: '2026-06-22 14:22', status: 'Locked', statusChanged: '2026-06-22' }
    ],
    auditLogs: [
        { timestamp: '2026-06-24 08:15:32', user: 'admin', action: 'Login successful', module: 'Authentication', ip: '192.168.1.10' },
        { timestamp: '2026-06-24 07:42:18', user: 'sreyneang', action: 'Approved loan AC-L-0892', module: 'Loan Management', ip: '192.168.1.25' },
        { timestamp: '2026-06-23 16:55:04', user: 'admin', action: 'Updated role permissions for Loan Officer', module: 'User Management', ip: '192.168.1.10' },
        { timestamp: '2026-06-23 14:30:11', user: 'vuthy', action: 'Registered borrower CID-000006', module: 'Borrowers', ip: '10.0.2.45' },
        { timestamp: '2026-06-22 18:00:00', user: 'system', action: 'EOD batch completed', module: 'Periodic', ip: '127.0.0.1' },
        { timestamp: '2026-06-22 14:22:55', user: 'chantha', action: 'Account locked after 5 failed logins', module: 'Authentication', ip: '192.168.1.88' }
    ],
    cashTransfers: [],
    chartOfAccounts: [
        { code: '1001', name: 'Cash in Hand',              type: 'Asset',     normalBal: 'Debit',  balance: 0 },
        { code: '1002', name: 'Cash at Bank',              type: 'Asset',     normalBal: 'Debit',  balance: 0 },
        { code: '1101', name: 'Loan Portfolio (Gross)',    type: 'Asset',     normalBal: 'Debit',  balance: 0 },
        { code: '1102', name: 'Interest Receivable',       type: 'Asset',     normalBal: 'Debit',  balance: 0 },
        { code: '1201', name: 'Fixed Assets (Net)',         type: 'Asset',     normalBal: 'Debit',  balance: 0 },
        { code: '2001', name: 'Savings Deposits',           type: 'Liability', normalBal: 'Credit', balance: 0 },
        { code: '2101', name: 'Commercial Borrowings',      type: 'Liability', normalBal: 'Credit', balance: 0 },
        { code: '2201', name: 'Accounts Payable',           type: 'Liability', normalBal: 'Credit', balance: 0 },
        { code: '2301', name: 'Tax Payable',                type: 'Liability', normalBal: 'Credit', balance: 0 },
        { code: '3001', name: 'Share Capital',              type: 'Equity',    normalBal: 'Credit', balance: 0 },
        { code: '3101', name: 'Retained Earnings',          type: 'Equity',    normalBal: 'Credit', balance: 0 },
        { code: '4001', name: 'Interest Income on Loans',  type: 'Revenue',   normalBal: 'Credit', balance: 0 },
        { code: '4002', name: 'Fee & Commission Income',   type: 'Revenue',   normalBal: 'Credit', balance: 0 },
        { code: '4003', name: 'Penalty & Recovery Income', type: 'Revenue',   normalBal: 'Credit', balance: 0 },
        { code: '4004', name: 'Other Income',               type: 'Revenue',   normalBal: 'Credit', balance: 0 },
        { code: '5001', name: 'Salaries & Benefits',        type: 'Expense',   normalBal: 'Debit',  balance: 0 },
        { code: '5002', name: 'Office Administration',      type: 'Expense',   normalBal: 'Debit',  balance: 0 },
        { code: '5003', name: 'Provision for Impairment',   type: 'Expense',   normalBal: 'Debit',  balance: 0 },
        { code: '5004', name: 'Tax & Regulation',           type: 'Expense',   normalBal: 'Debit',  balance: 0 },
        { code: '5005', name: 'Other Expenses',             type: 'Expense',   normalBal: 'Debit',  balance: 0 }
    ]
};

// --- STATE PERSISTENCE ---
const STORAGE_KEY = 'acabar-state-v3';

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            borrowers: state.borrowers,
            loanApplications: state.loanApplications,
            incomes: state.incomes,
            expenses: state.expenses,
            notifications: state.notifications,
            cashTransfers: state.cashTransfers,
            chartOfAccounts: state.chartOfAccounts
        }));
    } catch(e) {}
}

function migrateBorrowerCodes() {
    // Upgrade old short codes (CID-01) to new 6-digit format (CID-000001)
    const oldPattern = /^CID-(\d{1,5})$/;
    let changed = false;
    const codeMap = {};
    state.borrowers.forEach(b => {
        const m = b.code.match(oldPattern);
        if (m) {
            const newCode = `CID-${m[1].padStart(6, '0')}`;
            codeMap[b.code] = newCode;
            b.code = newCode;
            changed = true;
        }
    });
    if (changed) {
        // Update any loan applications that reference the old borrower code
        state.loanApplications.forEach(a => {
            if (codeMap[a.borrowerCode]) a.borrowerCode = codeMap[a.borrowerCode];
        });
        saveState();
    }
}

function loadState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return;
        const parsed = JSON.parse(saved);
        if (parsed.borrowers && Array.isArray(parsed.borrowers)) state.borrowers = parsed.borrowers;
        if (parsed.loanApplications && Array.isArray(parsed.loanApplications)) state.loanApplications = parsed.loanApplications;
        if (parsed.incomes && Array.isArray(parsed.incomes)) state.incomes = parsed.incomes;
        if (parsed.expenses && Array.isArray(parsed.expenses)) state.expenses = parsed.expenses;
        if (parsed.notifications && Array.isArray(parsed.notifications)) state.notifications = parsed.notifications;
        if (parsed.cashTransfers && Array.isArray(parsed.cashTransfers)) state.cashTransfers = parsed.cashTransfers;
        if (parsed.chartOfAccounts && Array.isArray(parsed.chartOfAccounts)) state.chartOfAccounts = parsed.chartOfAccounts;
    } catch(e) {}
}

// --- 2. INITIALIZATION ---
window.addEventListener('DOMContentLoaded', () => {
    loadState();
    migrateBorrowerCodes();
    restorePendingDocs();
    // Move modals to <body> so they escape nested stacking contexts
    // (overflow-y:auto + relative on ancestor creates a stacking context
    //  that clips z-index even on fixed elements)
    ['borrower-wizard-modal', 'loan-wizard-modal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) document.body.appendChild(el);
    });
    // Restore dark mode icon if preference was saved
    try {
        if (localStorage.getItem('acabar-dark-mode') === '1') {
            state.darkMode = true;
            const icon = document.getElementById('dark-mode-icon');
            if (icon) icon.setAttribute('data-lucide', 'sun');
        }
    } catch(e) {}
    // Restore language preference
    try {
        const savedLang = localStorage.getItem('acabar-lang');
        if (savedLang === 'kh') {
            state.language = 'kh';
            document.getElementById('lang-flag').textContent = '🇰🇭';
            document.getElementById('lang-label').textContent = 'ខ្មែរ';
            applyTranslations('kh');
        }
    } catch(e) {}
    // Populate province dropdowns
    const provinceOpts = '<option value="">-- Select Province --</option>' +
        KH_PROVINCES.map(p => `<option value="${p}">${p}</option>`).join('');
    ['w-cur-province', 'w-perm-province'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = provinceOpts;
    });

    lucide.createIcons();
    switchTab(state.activeTab);
    switchUserManagementSubMenu(state.activeUserMgmtSubMenu);
    renderUserAccountsTable();
    renderRolesList();
    renderBranchAssignmentTable();
    renderAuditTrailTable();
    renderUserStatusTable();
    renderBorrowerSelectDropdown();
    renderBorrowersTable();
    renderLoanApplicationsList();
    switchAccountingSubTab('income');
    initLoanApplicationDates();
    loanWizardStepChange(0);
    updateBorrowerInfoPreview();
    renderAccountingGrids();
    renderAccountingStatements();
    renderActiveLoanReport();
    renderRepaymentReport();
    renderDueTodayReport();
    renderPARReport();
    renderWriteOffReport();
    loadRolePermissions();
    renderNotifications();
    updateTotalBorrowerCountBadge();
    updateLiveCurrencyOutputs();
    renderDashboard();

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const settingsModal = document.getElementById('settings-modal');
            if (settingsModal && !settingsModal.classList.contains('hidden')) closeSettingsModal();
            const borrowerModal = document.getElementById('borrower-wizard-modal');
            if (borrowerModal && !borrowerModal.classList.contains('hidden')) toggleBorrowerWizard(false);
            const loanModal = document.getElementById('loan-wizard-modal');
            if (loanModal && !loanModal.classList.contains('hidden')) closeLoanWizard();
            const profilePanel = document.getElementById('user-profile-panel');
            if (profilePanel) profilePanel.classList.add('hidden');
            const deleteModal = document.getElementById('confirm-delete-modal');
            if (deleteModal && !deleteModal.classList.contains('hidden')) cancelDeleteBorrower();
        }
    });

    document.addEventListener('click', (e) => {
        const profilePanel = document.getElementById('user-profile-panel');
        if (profilePanel && !profilePanel.classList.contains('hidden')) {
            if (!e.target.closest('#user-profile-panel') && !e.target.closest('[onclick*="toggleUserProfile"]')) {
                profilePanel.classList.add('hidden');
            }
        }
    });
});

// --- 3. GLOBAL TAB & STATE NAVIGATION ---
const tabTitles = {
    'dashboard': 'Dashboard',
    'borrowers': 'Borrower Management',
    'open-loan': 'Loan Application',
    'accounting': 'Accounting Management',
    'reports': 'Loan Reports'
};

function switchTab(tabId) {
    state.activeTab = tabId;
    // Toggle Content Views
    document.querySelectorAll('.tab-view').forEach(view => {
        view.classList.add('hidden');
    });
    const activeView = document.getElementById(`tab-content-${tabId}`);
    if (activeView) activeView.classList.remove('hidden');

    // Toggle Sidebar Nav States
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('bg-brand-600', 'text-white', 'hover:bg-brand-600/90');
        link.classList.add('text-slate-600', 'hover:text-slate-900', 'hover:bg-slate-100');
    });

    const activeLink = document.getElementById(`btn-tab-${tabId}`);
    if (activeLink) {
        activeLink.classList.remove('text-slate-600', 'hover:text-slate-900', 'hover:bg-slate-100');
        activeLink.classList.add('bg-brand-600', 'text-white', 'hover:bg-brand-600/90');
    }

    // Update header page title
    const titleEl = document.getElementById('header-page-title');
    if (titleEl) titleEl.textContent = tabTitles[tabId] || 'Dashboard';

    // Refresh dashboard when navigating to it
    if (tabId === 'dashboard') renderDashboard();
}

// --- TRANSLATIONS ---
const translations = {
    en: {
        'app-subtitle':        'Loan Management System',
        'nav-modules':         'Modules',
        'nav-borrower':        'Borrower',
        'nav-open-loan':       'Open Loan',
        'nav-accounting':      'Accounting Management',
        'nav-reports':         'Loan Report',
        'nav-management':      'Management',
        'nav-settings':        'System Settings',
        'hdr-notifications':   'Notifications',
        'hdr-mark-read':       'Mark all read',
        'hdr-my-profile':      'My Profile',
        'hdr-settings':        'System Settings',
        'hdr-dark-mode':       'Toggle Dark Mode',
        'hdr-sign-out':        'Sign Out',
        'pg-borrowers-title':  'Borrower Management',
        'pg-borrowers-sub':    'Register, manage and screen borrower portfolios.',
        'btn-new-borrower':    'Open New Borrower',
        'pg-loan-title':       'New Application',
        'pg-loan-sub':         'Complete the 3-step loan application, then review the repayment schedule, track repayments, and monitor the approval line.',
        'pg-acct-title':       'Accounting Management',
        'pg-acct-sub':         'Track income, expenses, and financial statements connected to loan disbursement activity.',
        'btn-log-income':      'Log Income',
        'btn-log-expense':     'Log Expense',
        'kpi-income-label':    'Total Income',
        'kpi-expense-label':   'Total Expenses',
        'kpi-profit-label':    'Net Profit',
        'kpi-portfolio-label': 'Loan Portfolio',
        'acct-tab-income':     'Income Ledger',
        'acct-tab-expense':    'Expense Ledger',
        'acct-tab-reports':    'Financial Reports',
        'pg-rpt-title':        'Loan Reports',
        'pg-rpt-sub':          'Comprehensive portfolio reporting — active loans, repayments, due dates, arrears, and write-offs.',
        'btn-export-report':   'Export Report',
        'rpt-tab-active':      'Active Loans',
        'rpt-tab-repayment':   'Repayment',
        'rpt-tab-due-today':   'Due Today',
        'rpt-tab-arrears':     'Arrears',
        'rpt-tab-writeoff':    'Write-off',
        'rpt-filter-branch':   'Branch',
        'rpt-filter-product':  'Product',
        'rpt-filter-date':     'As of Date',
        'btn-reset':           'Reset',
    },
    kh: {
        'app-subtitle':        'ប្រព័ន្ធគ្រប់គ្រងកម្ចីប្រាក់',
        'nav-modules':         'ម៉ូឌុល',
        'nav-borrower':        'អ្នកខ្ចី',
        'nav-open-loan':       'ដាក់ពាក្យខ្ចី',
        'nav-accounting':      'គ្រប់គ្រងគណនេយ្យ',
        'nav-reports':         'របាយការណ៍កម្ចី',
        'nav-management':      'ការគ្រប់គ្រង',
        'nav-settings':        'ការកំណត់ប្រព័ន្ធ',
        'hdr-notifications':   'សារជូនដំណឹង',
        'hdr-mark-read':       'សម្គាល់ទាំងអស់ថាបានអាន',
        'hdr-my-profile':      'ប្រវត្តិរូបខ្ញុំ',
        'hdr-settings':        'ការកំណត់ប្រព័ន្ធ',
        'hdr-dark-mode':       'ប្ដូររបៀបងងឹត / ភ្លឺ',
        'hdr-sign-out':        'ចាកចេញ',
        'pg-borrowers-title':  'គ្រប់គ្រងអ្នកខ្ចី',
        'pg-borrowers-sub':    'ចុះឈ្មោះ គ្រប់គ្រង និងពិនិត្យ ប្រតិទិនអ្នកខ្ចីប្រាក់',
        'btn-new-borrower':    'ចុះឈ្មោះអ្នកខ្ចីថ្មី',
        'pg-loan-title':       'ដាក់ពាក្យស្នើសុំកម្ចីថ្មី',
        'pg-loan-sub':         'បំពេញពាក្យស្នើសុំ ៣ ជំហាន បន្ទាប់មកពិនិត្យកាលវិភាគទូទាត់ តាមដានការទូទាត់ និងតាមដានបន្ទាត់អនុម័ត',
        'pg-acct-title':       'គ្រប់គ្រងគណនេយ្យ',
        'pg-acct-sub':         'តាមដានចំណូល ចំណាយ និងរបាយការណ៍ហិរញ្ញវត្ថុ ដែលភ្ជាប់ជាមួយការបញ្ចេញប្រាក់កម្ចី',
        'btn-log-income':      'កត់ចំណូល',
        'btn-log-expense':     'កត់ចំណាយ',
        'kpi-income-label':    'ចំណូលសរុប',
        'kpi-expense-label':   'ចំណាយសរុប',
        'kpi-profit-label':    'ប្រាក់ចំណេញសុទ្ធ',
        'kpi-portfolio-label': 'ផលប័ត្រកម្ចី',
        'acct-tab-income':     'បញ្ជីចំណូល',
        'acct-tab-expense':    'បញ្ជីចំណាយ',
        'acct-tab-reports':    'របាយការណ៍ហិរញ្ញវត្ថុ',
        'pg-rpt-title':        'របាយការណ៍កម្ចី',
        'pg-rpt-sub':          'របាយការណ៍ផលប័ត្រ — កម្ចីសកម្ម ការទូទាត់ ថ្ងៃកំណត់ ការជំពាក់ និងការដកចោល',
        'btn-export-report':   'នាំចេញរបាយការណ៍',
        'rpt-tab-active':      'កម្ចីសកម្ម',
        'rpt-tab-repayment':   'ការទូទាត់',
        'rpt-tab-due-today':   'ដល់ថ្ងៃនេះ',
        'rpt-tab-arrears':     'ជំពាក់',
        'rpt-tab-writeoff':    'លុបចោល',
        'rpt-filter-branch':   'សាខា',
        'rpt-filter-product':  'ផលិតផល',
        'rpt-filter-date':     'គិតត្រឹមថ្ងៃ',
        'btn-reset':           'កំណត់ឡើងវិញ',
    }
};

function applyTranslations(lang) {
    const t = translations[lang] || translations.en;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (t[key] !== undefined) el.textContent = t[key];
    });
    // Switch font for Khmer to ensure correct rendering
    document.body.style.fontFamily = lang === 'kh'
        ? '"Kantumruy Pro", "Outfit", sans-serif'
        : '"Outfit", "Kantumruy Pro", sans-serif';
}

// --- HEADER UTILITIES ---
function toggleLanguage() {
    const isEn = state.language !== 'kh';
    state.language = isEn ? 'kh' : 'en';
    document.getElementById('lang-flag').textContent = isEn ? '🇰🇭' : '🇺🇸';
    document.getElementById('lang-label').textContent = isEn ? 'ខ្មែរ' : 'EN';
    applyTranslations(state.language);
    try { localStorage.setItem('acabar-lang', state.language); } catch(e) {}
    showToast(isEn ? 'ភាសា: ខ្មែរ — Switched to Khmer' : 'Language: English', 'info');
}

function toggleDarkMode() {
    const isDark = document.documentElement.classList.toggle('dark');
    state.darkMode = isDark;
    // Sync html base bg so there's no flash on edges
    document.documentElement.style.backgroundColor = isDark ? '#0f172a' : '';
    const icon = document.getElementById('dark-mode-icon');
    if (icon) { icon.setAttribute('data-lucide', isDark ? 'sun' : 'moon'); lucide.createIcons(); }
    try { localStorage.setItem('acabar-dark-mode', isDark ? '1' : '0'); } catch(e) {}
    showToast(isDark ? 'Dark mode enabled' : 'Light mode enabled', 'info');
}

function toggleUserProfile() {
    const panel = document.getElementById('user-profile-panel');
    if (panel) panel.classList.toggle('hidden');
}

function switchSettingsMenu(menuId) {
    state.activeSettingsMenu = menuId;

    document.querySelectorAll('.settings-panel').forEach(p => p.classList.add('hidden'));
    const activePanel = document.getElementById(`settings-panel-${menuId}`);
    if (activePanel) activePanel.classList.remove('hidden');

    document.querySelectorAll('.settings-sidebar-btn').forEach(btn => {
        btn.classList.remove('bg-brand-50', 'text-brand-700', 'ring-1', 'ring-brand-200/80');
        btn.classList.add('text-slate-600', 'hover:bg-slate-100', 'hover:text-slate-900');
    });
    const activeBtn = document.getElementById(`btn-settings-${menuId}`);
    if (activeBtn) {
        activeBtn.classList.remove('text-slate-600', 'hover:bg-slate-100', 'hover:text-slate-900');
        activeBtn.classList.add('bg-brand-50', 'text-brand-700', 'ring-1', 'ring-brand-200/80');
    }

    updateSettingsContentHeader(menuId);
    lucide.createIcons();
}

const settingsContentMeta = {
    'company-profile': {
        title: 'Company Profile',
        subtitle: 'Maintain institution identity, branch code and operational defaults.'
    },
    'loan-product': {
        title: 'Loan Product',
        subtitle: 'Define product names, interest boundaries, and tenor defaults.'
    },
    'approval-line': {
        title: 'Approval Line',
        subtitle: 'Configure multi-level loan approval workflows and approver roles.'
    },
    'periodic': {
        title: 'Periodic',
        subtitle: 'End-of-day and end-of-month batch processing simulations.'
    }
};

const userMgmtContentMeta = {
    'user-accounts': {
        title: 'User Accounts',
        subtitle: 'Create, edit, and manage system user accounts and login credentials.'
    },
    'roles-permissions': {
        title: 'Roles & Permissions',
        subtitle: 'Configure permission scopes across Credit Manager, Admin and Loan Officer roles.'
    },
    'access-control': {
        title: 'Access Control',
        subtitle: 'Session policies, IP restrictions, and login attempt limits.'
    },
    'branch-assignment': {
        title: 'Branch / Department Assignment',
        subtitle: 'Assign users to branches and departments for scoped data access.'
    },
    'audit-trail': {
        title: 'Audit Trail / Activity Log',
        subtitle: 'Immutable record of user actions, logins, and configuration changes.'
    },
    'password-security': {
        title: 'Password & Security Settings',
        subtitle: 'Enforce password complexity, expiry, and security policies.'
    },
    'user-status': {
        title: 'User Status',
        subtitle: 'Activate, deactivate, lock, or suspend user accounts.'
    }
};

function updateSettingsContentHeader(key, metaMap = settingsContentMeta) {
    const meta = metaMap[key];
    if (!meta) return;
    const titleEl = document.getElementById('settings-content-title');
    const subtitleEl = document.getElementById('settings-content-subtitle');
    if (titleEl) titleEl.innerText = meta.title;
    if (subtitleEl) subtitleEl.innerText = meta.subtitle;
}

function openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');

    if (state.activeSettingsMenu === 'user-management') {
        switchUserManagementSubMenu(state.activeUserMgmtSubMenu);
    } else {
        switchSettingsMenu(state.activeSettingsMenu);
    }
    lucide.createIcons();
}

function closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

function switchUserManagementSubMenu(subMenuId) {
    state.activeUserMgmtSubMenu = subMenuId;
    state.activeSettingsMenu = 'user-management';

    document.querySelectorAll('.settings-panel').forEach(p => p.classList.add('hidden'));
    const parentPanel = document.getElementById('settings-panel-user-management');
    if (parentPanel) parentPanel.classList.remove('hidden');

    document.querySelectorAll('.user-mgmt-subpanel').forEach(p => p.classList.add('hidden'));
    const activePanel = document.getElementById(`user-mgmt-panel-${subMenuId}`);
    if (activePanel) activePanel.classList.remove('hidden');

    document.querySelectorAll('.settings-sidebar-btn').forEach(btn => {
        btn.classList.remove('bg-brand-50', 'text-brand-700', 'ring-1', 'ring-brand-200/80');
        btn.classList.add('text-slate-600', 'hover:bg-slate-100', 'hover:text-slate-900');
    });
    const activeBtn = document.getElementById(`btn-user-mgmt-${subMenuId}`);
    if (activeBtn) {
        activeBtn.classList.remove('text-slate-600', 'hover:bg-slate-100', 'hover:text-slate-900');
        activeBtn.classList.add('bg-brand-50', 'text-brand-700', 'ring-1', 'ring-brand-200/80');
    }

    updateSettingsContentHeader(subMenuId, userMgmtContentMeta);
    lucide.createIcons();
}

function getUserStatusBadge(status) {
    const styles = {
        'Active': 'bg-emerald-50 text-emerald-700 border-emerald-200',
        'Inactive': 'bg-slate-100 text-slate-600 border-slate-200',
        'Locked': 'bg-amber-50 text-amber-700 border-amber-200',
        'Suspended': 'bg-rose-50 text-rose-700 border-rose-200'
    };
    return `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${styles[status] || styles['Inactive']}">${status}</span>`;
}

function renderUserAccountsTable() {
    const tbody = document.getElementById('user-accounts-table-body');
    if (!tbody) return;
    tbody.innerHTML = state.systemUsers.map(u => `
        <tr class="hover:bg-slate-50/50 transition-colors">
            <td class="px-6 py-3.5 font-semibold text-slate-800">${u.username}</td>
            <td class="px-6 py-3.5 text-slate-600">${u.fullName}</td>
            <td class="px-6 py-3.5 text-slate-600">${u.role}</td>
            <td class="px-6 py-3.5 text-slate-600">${u.branch}</td>
            <td class="px-6 py-3.5 text-slate-500 text-xs">${u.lastLogin}</td>
            <td class="px-6 py-3.5 text-right">
                <button onclick="showToast('Edit user ${u.username} (mock)', 'info')" class="text-xs font-bold text-brand-600 hover:text-brand-700">Edit</button>
            </td>
        </tr>
    `).join('');
}

function renderRolesList() {
    const container = document.getElementById('roles-list-container');
    if (!container) return;
    const roles = Object.keys(state.roleMatrix);
    container.innerHTML = roles.map(role => {
        const permCount = Object.values(state.roleMatrix[role]).filter(Boolean).length;
        const total = Object.keys(state.roleMatrix[role]).length;
        return `
            <div class="flex items-center justify-between p-3 bg-slate-50 border border-slate-200/50 rounded-xl">
                <div>
                    <span class="text-xs font-bold text-slate-800">${role}</span>
                    <p class="text-[10px] text-slate-500 mt-0.5">${permCount} of ${total} permissions enabled</p>
                </div>
                <button onclick="document.getElementById('settings-role-selector').value='${role}'; loadRolePermissions();" class="text-[10px] font-bold text-brand-600 hover:text-brand-700">Configure</button>
            </div>
        `;
    }).join('');
}

function renderBranchAssignmentTable() {
    const tbody = document.getElementById('branch-assignment-table-body');
    if (!tbody) return;
    tbody.innerHTML = state.systemUsers.map(u => `
        <tr class="hover:bg-slate-50/50 transition-colors">
            <td class="px-6 py-3.5">
                <span class="font-semibold text-slate-800">${u.fullName}</span>
                <span class="block text-[10px] text-slate-400">${u.username}</span>
            </td>
            <td class="px-6 py-3.5 text-slate-600">${u.branch}</td>
            <td class="px-6 py-3.5 text-slate-600">${u.department}</td>
            <td class="px-6 py-3.5">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-brand-50 text-brand-700 border border-brand-200">Primary</span>
            </td>
            <td class="px-6 py-3.5 text-right">
                <button onclick="showToast('Reassign ${u.username} (mock)', 'info')" class="text-xs font-bold text-brand-600 hover:text-brand-700">Reassign</button>
            </td>
        </tr>
    `).join('');
}

function renderAuditTrailTable() {
    const tbody = document.getElementById('audit-trail-table-body');
    if (!tbody) return;
    tbody.innerHTML = state.auditLogs.map(log => `
        <tr class="hover:bg-slate-50/50 transition-colors">
            <td class="px-6 py-3.5 text-slate-500 text-xs font-mono">${log.timestamp}</td>
            <td class="px-6 py-3.5 font-semibold text-slate-800">${log.user}</td>
            <td class="px-6 py-3.5 text-slate-600">${log.action}</td>
            <td class="px-6 py-3.5 text-slate-600">${log.module}</td>
            <td class="px-6 py-3.5 text-slate-500 text-xs font-mono">${log.ip}</td>
        </tr>
    `).join('');
}

function renderUserStatusTable() {
    const tbody = document.getElementById('user-status-table-body');
    if (!tbody) return;
    const filtered = state.userStatusFilter === 'all'
        ? state.systemUsers
        : state.systemUsers.filter(u => u.status === state.userStatusFilter);
    tbody.innerHTML = filtered.map(u => `
        <tr class="hover:bg-slate-50/50 transition-colors">
            <td class="px-6 py-3.5 font-semibold text-slate-800">${u.username}</td>
            <td class="px-6 py-3.5 text-slate-600">${u.fullName}</td>
            <td class="px-6 py-3.5">${getUserStatusBadge(u.status)}</td>
            <td class="px-6 py-3.5 text-slate-500 text-xs">${u.statusChanged}</td>
            <td class="px-6 py-3.5 text-right">
                <button onclick="showToast('Change status for ${u.username} (mock)', 'info')" class="text-xs font-bold text-brand-600 hover:text-brand-700">Manage</button>
            </td>
        </tr>
    `).join('');
}

function filterUserStatus(status) {
    state.userStatusFilter = status;
    document.querySelectorAll('.user-status-filter-btn').forEach(btn => {
        const isActive = btn.dataset.filter === status;
        btn.className = isActive
            ? 'user-status-filter-btn px-4 py-1.5 rounded-lg text-xs font-bold bg-slate-900 text-white'
            : 'user-status-filter-btn px-4 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200';
    });
    renderUserStatusTable();
}

function saveAccessControlSettings() {
    const timeout = document.getElementById('access-session-timeout')?.value;
    const attempts = document.getElementById('access-max-attempts')?.value;
    showToast(`Access Control saved: ${timeout}min session, ${attempts} max attempts`, 'success');
}

function savePasswordSecuritySettings() {
    const minLen = document.getElementById('pwd-min-length')?.value;
    const expiry = document.getElementById('pwd-expiry-days')?.value;
    showToast(`Security policy saved: min ${minLen} chars, ${expiry}-day expiry`, 'success');
}

function setCurrency(currType) {
    state.currency = currType;
    
    // Toggle visual state on currency indicator buttons
    const btnUsd = document.getElementById('btn-currency-usd');
    const btnKhr = document.getElementById('btn-currency-khr');

    if (currType === 'USD') {
        btnUsd.className = "px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 flex items-center gap-1 bg-white text-slate-800 shadow-sm border border-slate-200/50";
        btnKhr.className = "px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 flex items-center gap-1 text-slate-500 hover:text-slate-800";
        
        document.getElementById('loan-currency-symbol').innerText = "$";
        document.getElementById('loan-currency-label').innerText = "USD";
    } else {
        btnKhr.className = "px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 flex items-center gap-1 bg-white text-slate-800 shadow-sm border border-slate-200/50";
        btnUsd.className = "px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 flex items-center gap-1 text-slate-500 hover:text-slate-800";
        
        document.getElementById('loan-currency-symbol').innerText = "KHR";
        document.getElementById('loan-currency-label').innerText = "KHR";
    }

    // Trigger updates of all monetary values in UI
    updateLiveCurrencyOutputs();
    calculateAmortizationSchedule();
    showToast(`Currency format switched to ${currType}`, 'info');
}

// --- 4. FORMATTING UTILITIES ---
function formatVal(amount) {
    if (state.currency === 'USD') {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
    } else {
        const converted = Math.round(amount * CONVERSION_RATE);
        return new Intl.NumberFormat('km-KH', { style: 'currency', currency: 'KHR', maximumFractionDigits: 0 }).format(converted);
    }
}

function updateLiveCurrencyOutputs() {
    renderAccountingGrids();
    renderAccountingStatements();
    renderPARReport();

    // Report Tab KPIs
    document.getElementById('rpt-active-portfolio').innerText = formatVal(4850000);
    document.getElementById('rpt-due-today').innerText = formatVal(12450);
    document.getElementById('rpt-arrears-balance').innerText = formatVal(75800);
}

// --- 5. BORROWER MODULE REGISTRATION WIZARD ---
function toggleBorrowerWizard(show) {
    const modal = document.getElementById('borrower-wizard-modal');
    const card = document.getElementById('borrower-wizard-card');
    if (show) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        // Auto generate next code
        const nextNum = String(state.borrowers.length + 1).padStart(6, '0');
        document.getElementById('w-cust-code').value = `CID-${nextNum}`;
        state.wizardStep = 1;
        wizardStepChange(0); // init step view
        resetOptionalSections();
        lucide.createIcons();
    } else {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
        state.editingBorrowerCode = null;
        const wizardTitle = card.querySelector('h3');
        if (wizardTitle) wizardTitle.textContent = 'New Borrower Registration';
        document.getElementById('borrower-form').reset();
        // Re-inject province options after reset clears selects
        const provinceOpts = '<option value="">-- Select Province --</option>' +
            KH_PROVINCES.map(p => `<option value="${p}">${p}</option>`).join('');
        ['w-cur-province', 'w-perm-province'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = provinceOpts;
        });
        ['w-cur-district', 'w-perm-district'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<option value="">-- Select Province first --</option>';
        });
        ['w-cur-commune', 'w-perm-commune'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<option value="">-- Select District first --</option>';
        });
        document.getElementById('guar-file-status').classList.add('hidden');
        ['w-photo-status', 'w-co-photo-status', 'w-guar-photo-status'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.classList.add('hidden');
                el.innerHTML = '';
            }
        });
    }
}

function wizardStepChange(stepDelta) {
    const newStep = state.wizardStep + stepDelta;
    if (newStep < 1 || newStep > 3) return;

    // Hide all step content wrappers
    document.getElementById('wizard-step-1-content').classList.add('hidden');
    document.getElementById('wizard-step-2-content').classList.add('hidden');
    document.getElementById('wizard-step-3-content').classList.add('hidden');

    // Show current step content
    document.getElementById(`wizard-step-${newStep}-content`).classList.remove('hidden');

    // Reset step tracker bubbles styling
    for (let i = 1; i <= 3; i++) {
        const bubble = document.getElementById(`wizard-step-${i}-bubble`);
        const label = document.getElementById(`wizard-step-${i}-label`);
        
        if (i < newStep) {
            // Completed step
            bubble.className = "w-7 h-7 rounded-full bg-emerald-500 text-white font-bold text-xs flex items-center justify-center ring-4 ring-emerald-100 transition-all duration-200";
            label.className = "text-xs font-bold text-slate-800 truncate";
        } else if (i === newStep) {
            // Active step
            bubble.className = "w-7 h-7 rounded-full bg-brand-600 text-white font-bold text-xs flex items-center justify-center ring-4 ring-brand-100 transition-all duration-200";
            label.className = "text-xs font-bold text-slate-800 truncate";
        } else {
            // Future step
            bubble.className = "w-7 h-7 rounded-full bg-slate-200 text-slate-600 font-bold text-xs flex items-center justify-center transition-all duration-200";
            label.className = "text-xs font-semibold text-slate-400 truncate";
        }
    }

    // Step connector lines
    const line1 = document.getElementById('wizard-line-1');
    const line2 = document.getElementById('wizard-line-2');
    if (line1) line1.className = `w-12 h-0.5 mx-2 flex-shrink-0 ${newStep > 1 ? 'bg-emerald-500' : 'bg-slate-200'}`;
    if (line2) line2.className = `w-12 h-0.5 mx-2 flex-shrink-0 ${newStep > 2 ? 'bg-emerald-500' : 'bg-slate-200'}`;

    // Button controls
    const prevBtn = document.getElementById('wizard-prev-btn');
    const nextBtn = document.getElementById('wizard-next-btn');
    const submitBtn = document.getElementById('wizard-submit-btn');

    if (newStep === 1) {
        prevBtn.classList.add('hidden');
        nextBtn.classList.remove('hidden');
        submitBtn.classList.add('hidden');
    } else if (newStep === 2) {
        prevBtn.classList.remove('hidden');
        nextBtn.classList.remove('hidden');
        submitBtn.classList.add('hidden');
    } else if (newStep === 3) {
        prevBtn.classList.remove('hidden');
        nextBtn.classList.add('hidden');
        submitBtn.classList.remove('hidden');
    }

    state.wizardStep = newStep;
    lucide.createIcons();
}

function getFormValue(id) {
    return document.getElementById(id)?.value?.trim() || '';
}

function toggleCoBorrowerSection() {
    const on = document.getElementById('toggle-co-borrower').checked;
    document.getElementById('co-borrower-fields').classList.toggle('hidden', !on);
    document.getElementById('co-borrower-empty').classList.toggle('hidden', on);
}

function toggleGuarantorSection() {
    const on = document.getElementById('toggle-guarantor').checked;
    document.getElementById('guarantor-fields').classList.toggle('hidden', !on);
    document.getElementById('guarantor-empty').classList.toggle('hidden', on);
}

function resetOptionalSections() {
    const coToggle = document.getElementById('toggle-co-borrower');
    const guarToggle = document.getElementById('toggle-guarantor');
    if (coToggle) { coToggle.checked = false; toggleCoBorrowerSection(); }
    if (guarToggle) { guarToggle.checked = false; toggleGuarantorSection(); }
}

const PENDING_DOCS_KEY = 'acabar-pending-docs';

function savePendingDocs() {
    try {
        const docs = _pendingDocs.map(d => ({ type: d.type, name: d.name, size: d.size }));
        sessionStorage.setItem(PENDING_DOCS_KEY, JSON.stringify(docs));
    } catch(e) {}
}

function renderDocRow(doc, idx) {
    const items = document.getElementById('w-doc-items');
    const list  = document.getElementById('w-doc-list');
    if (!items) return;
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between gap-3 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl';
    row.id = `w-doc-row-${idx}`;
    row.innerHTML = `
        <div class="flex items-center gap-2 min-w-0">
            <i data-lucide="file-text" class="w-4 h-4 text-brand-500 flex-shrink-0"></i>
            <div class="min-w-0">
                <p class="text-xs font-bold text-slate-700 truncate">${doc.type}</p>
                <p class="text-[10px] text-slate-400 truncate">${doc.name} &middot; ${doc.size} KB</p>
            </div>
        </div>
        <button type="button" onclick="removeSupportingDocument(${idx})"
            class="p-1 text-slate-400 hover:text-rose-500 transition-colors flex-shrink-0">
            <i data-lucide="x" class="w-3.5 h-3.5"></i>
        </button>
    `;
    items.appendChild(row);
    if (list) list.classList.remove('hidden');
}

let _pendingDocs = [];

function restorePendingDocs() {
    try {
        const saved = JSON.parse(sessionStorage.getItem(PENDING_DOCS_KEY) || '[]');
        _pendingDocs = saved;
        saved.forEach((doc, idx) => renderDocRow(doc, idx));
        if (saved.length) lucide.createIcons();
    } catch(e) {}
}

function updateDocFileLabel(input) {
    const label = document.getElementById('w-doc-file-label');
    if (label) label.textContent = input.files[0] ? input.files[0].name : 'No file chosen';
}

function addSupportingDocument() {
    const typeEl = document.getElementById('w-doc-type');
    const fileEl = document.getElementById('w-doc-file');
    const type = typeEl?.value;
    const file = fileEl?.files[0];

    if (!type) { showToast('Please select a document type.', 'warning'); return; }
    if (!file) { showToast('Please choose a file.', 'warning'); return; }

    const doc = { type, name: file.name, size: Math.round(file.size / 1024) };
    const idx = _pendingDocs.length;
    _pendingDocs.push(doc);
    savePendingDocs();
    renderDocRow(doc, idx);

    typeEl.value = '';
    fileEl.value = '';
    document.getElementById('w-doc-file-label').textContent = 'No file chosen';
    lucide.createIcons();
}

function removeSupportingDocument(idx) {
    _pendingDocs.splice(idx, 1);
    savePendingDocs();
    // Re-render all rows with updated indices
    const items = document.getElementById('w-doc-items');
    const list  = document.getElementById('w-doc-list');
    if (items) items.innerHTML = '';
    _pendingDocs.forEach((doc, i) => renderDocRow(doc, i));
    if (list) list.classList.toggle('hidden', !_pendingDocs.length);
    lucide.createIcons();
}

function resetSupportingDocuments() {
    _pendingDocs = [];
    sessionStorage.removeItem(PENDING_DOCS_KEY);
    const items = document.getElementById('w-doc-items');
    const list  = document.getElementById('w-doc-list');
    if (items) items.innerHTML = '';
    if (list)  list.classList.add('hidden');
    const typeEl = document.getElementById('w-doc-type');
    const fileEl = document.getElementById('w-doc-file');
    const label  = document.getElementById('w-doc-file-label');
    if (typeEl) typeEl.value = '';
    if (fileEl) fileEl.value = '';
    if (label)  label.textContent = 'No file chosen';
}

function handlePhotoFileSelect(input, statusId) {
    const status = document.getElementById(statusId);
    if (!status) return;
    if (input.files && input.files[0]) {
        status.innerHTML = `<i data-lucide="check-circle" class="w-3.5 h-3.5"></i> ${input.files[0].name} (${Math.round(input.files[0].size / 1024)}KB)`;
        status.classList.remove('hidden');
        lucide.createIcons();
        showToast('Photo uploaded successfully.', 'success');
    }
}

function handleGuarFileSelect(input) {
    if (input.files && input.files[0]) {
        const status = document.getElementById('guar-file-status');
        status.innerHTML = `<i data-lucide="check-circle" class="w-3.5 h-3.5"></i> ${input.files[0].name} (${Math.round(input.files[0].size/1024)}KB)`;
        status.classList.remove('hidden');
        lucide.createIcons();
        showToast("Guarantor agreement file uploaded successfully.", "success");
    }
}

function handleBorrowerSubmit(event) {
    event.preventDefault();

    const newBorrower = {
        code: getFormValue('w-cust-code'),
        khName: getFormValue('w-kh-name'),
        enName: getFormValue('w-en-name').toUpperCase(),
        gender: getFormValue('w-gender'),
        maritalStatus: getFormValue('w-marital-status'),
        dob: getFormValue('w-dob'),
        idType: getFormValue('w-id-type'),
        idNo: getFormValue('w-id-no'),
        phone: getFormValue('w-phone'),
        email: getFormValue('w-email'),
        currentAddress: {
            province: getFormValue('w-cur-province'),
            district: getFormValue('w-cur-district'),
            commune: getFormValue('w-cur-commune'),
            village: getFormValue('w-cur-village'),
            house: getFormValue('w-cur-house'),
            street: getFormValue('w-cur-street'),
        },
        permanentAddress: {
            province: getFormValue('w-perm-province'),
            district: getFormValue('w-perm-district'),
            commune: getFormValue('w-perm-commune'),
            village: getFormValue('w-perm-village'),
            house: getFormValue('w-perm-house'),
            street: getFormValue('w-perm-street'),
        },
        occupation: getFormValue('w-occupation'),
        employmentStatus: getFormValue('w-employment-status'),
        monthlyIncome: getFormValue('w-monthly-income'),
        otherIncome: getFormValue('w-other-income'),
        collateralType: getFormValue('w-collateral-type'),
        collateralValue: getFormValue('w-collateral-value'),
        collateralDocNo: getFormValue('w-collateral-doc-no'),
        collateralDescription: getFormValue('w-collateral-desc'),
        documents: _pendingDocs.map(d => ({ type: d.type, name: d.name, size: d.size })),
        coBorrower: document.getElementById('toggle-co-borrower')?.checked ? {
            khName: getFormValue('w-co-kh-name'),
            enName: getFormValue('w-co-en-name').toUpperCase(),
            dob: getFormValue('w-co-dob'),
            gender: getFormValue('w-co-gender'),
            idType: getFormValue('w-co-id-type'),
            idNo: getFormValue('w-co-id'),
            relation: getFormValue('w-co-relation'),
            phone: getFormValue('w-co-phone'),
            email: getFormValue('w-co-email'),
            maritalStatus: getFormValue('w-co-marital-status'),
            currentAddress: getFormValue('w-co-current-address'),
            permanentAddress: getFormValue('w-co-permanent-address'),
            occupation: getFormValue('w-co-occupation'),
            employmentStatus: getFormValue('w-co-employment-status'),
            monthlyIncome: getFormValue('w-co-monthly-income'),
            otherIncome: getFormValue('w-co-other-income')
        } : {},
        guarantor: document.getElementById('toggle-guarantor')?.checked ? {
            khName: getFormValue('w-guar-kh-name'),
            enName: getFormValue('w-guar-en-name').toUpperCase(),
            dob: getFormValue('w-guar-dob'),
            gender: getFormValue('w-guar-gender'),
            idType: getFormValue('w-guar-id-type'),
            idNo: getFormValue('w-guar-id-no'),
            relation: getFormValue('w-guar-relation'),
            phone: getFormValue('w-guar-phone'),
            email: getFormValue('w-guar-email'),
            currentAddress: getFormValue('w-guar-current-address'),
            permanentAddress: getFormValue('w-guar-permanent-address')
        } : {},
        status: 'Approved'
    };

    if (state.editingBorrowerCode) {
        const idx = state.borrowers.findIndex(b => b.code === state.editingBorrowerCode);
        if (idx !== -1) {
            newBorrower.status = state.borrowers[idx].status;
            state.borrowers[idx] = newBorrower;
        }
        state.editingBorrowerCode = null;
        showToast(`Borrower profile updated for ${newBorrower.enName}.`, 'success');
    } else {
        state.borrowers.unshift(newBorrower);
        showToast(`Borrower profile created for ${newBorrower.enName}.`, 'success');
    }

    renderBorrowerSelectDropdown();
    renderBorrowersTable();
    updateTotalBorrowerCountBadge();
    renderDashboard();
    saveState();
    resetSupportingDocuments();
    toggleBorrowerWizard(false);
}

// --- 6. BORROWERS GRID TABLE ---
let _currentBorrowerFilter = null;

function renderBorrowersTable(filteredData = null) {
    _currentBorrowerFilter = filteredData;
    const tableBody = document.getElementById('borrowers-table-rows');
    const dataToRender = filteredData !== null ? filteredData : state.borrowers;

    const total = dataToRender.length;
    const pageSize = state.borrowerPageSize;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (state.borrowerPage > totalPages) state.borrowerPage = 1;
    const start = (state.borrowerPage - 1) * pageSize;
    const pageData = dataToRender.slice(start, start + pageSize);

    tableBody.innerHTML = '';
    if (total === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" class="py-8 text-center text-slate-450 font-medium">
                    <i data-lucide="info" class="w-8 h-8 text-slate-350 mx-auto mb-2"></i>
                    No borrowers found matching queries.
                </td>
            </tr>
        `;
        lucide.createIcons();
        renderBorrowerPagination(0, 0, 0, 1);
        return;
    }

    pageData.forEach(row => {
        let badgeClass = "bg-slate-100 text-slate-700 border-slate-200";
        if (row.status === 'Active') badgeClass = "bg-emerald-50 text-emerald-700 border-emerald-200/50";
        else if (row.status === 'Approved') badgeClass = "bg-brand-50 text-brand-700 border-brand-200/50";
        else if (row.status === 'Pending') badgeClass = "bg-amber-50 text-amber-700 border-amber-200/50";

        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50/50 transition-colors cursor-pointer";
        tr.onclick = () => openBorrowerPreview(row.code);
        tr.innerHTML = `
            <td class="py-3.5 px-6 font-mono text-xs font-semibold text-slate-500">${row.code}</td>
            <td class="py-3.5 px-6">
                <div class="font-bold text-slate-800">${row.enName}</div>
                <div class="text-xs text-slate-500 font-medium mt-0.5">${row.khName || ''}</div>
            </td>
            <td class="py-3.5 px-6 text-slate-500 text-xs">${row.idType}</td>
            <td class="py-3.5 px-6 font-mono text-xs text-slate-650">${row.idNo}</td>
            <td class="py-3.5 px-6 font-mono text-xs text-slate-650">${row.phone}</td>
            <td class="py-3.5 px-6">
                <span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold border ${badgeClass}">
                    ${row.status}
                </span>
            </td>
            <td class="py-3.5 px-6 text-center">
                <div class="flex items-center justify-center gap-2">
                    <button onclick="event.stopPropagation(); openBorrowerPreview('${row.code}')" class="p-1 bg-slate-50 text-teal-600 hover:text-teal-700 hover:bg-teal-50 rounded-lg border border-slate-200 transition-all duration-150" title="Preview Profile">
                        <i data-lucide="eye" class="w-4 h-4"></i>
                    </button>
                    <button onclick="event.stopPropagation(); handleTableAction('${row.code}', 'Loan')" class="p-1 bg-slate-50 text-brand-600 hover:text-brand-700 hover:bg-slate-100 rounded-lg border border-slate-200 transition-all duration-150" title="New Application">
                        <i data-lucide="file-plus-2" class="w-4 h-4"></i>
                    </button>
                    <button onclick="event.stopPropagation(); handleTableAction('${row.code}', 'Edit')" class="p-1 bg-slate-50 text-amber-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg border border-slate-200 transition-all duration-150" title="Edit Profile">
                        <i data-lucide="pencil" class="w-4 h-4"></i>
                    </button>
                    <button onclick="event.stopPropagation(); confirmDeleteBorrower('${row.code}')" class="p-1 bg-slate-50 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg border border-slate-200 transition-all duration-150" title="Delete">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            </td>
        `;
        tableBody.appendChild(tr);
    });
    lucide.createIcons();
    renderBorrowerPagination(start + 1, Math.min(start + pageSize, total), total, totalPages);
}

function renderBorrowerPagination(from, to, total, totalPages) {
    const container = document.getElementById('borrower-pagination');
    if (!container) return;
    if (total === 0 || total <= state.borrowerPageSize) { container.innerHTML = ''; return; }
    container.innerHTML = `
        <div class="flex items-center justify-between text-xs text-slate-500">
            <span>Showing <span class="font-semibold text-slate-700">${from}–${to}</span> of <span class="font-semibold text-slate-700">${total}</span> records</span>
            <div class="flex items-center gap-1.5">
                <button onclick="changeBorrowerPage(-1)" ${state.borrowerPage <= 1 ? 'disabled' : ''} class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Prev</button>
                <span class="px-3 py-1.5 text-xs font-bold text-brand-700 bg-brand-50 border border-brand-200 rounded-lg">${state.borrowerPage} / ${totalPages}</span>
                <button onclick="changeBorrowerPage(1)" ${state.borrowerPage >= totalPages ? 'disabled' : ''} class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Next</button>
            </div>
        </div>
    `;
}

function changeBorrowerPage(delta) {
    state.borrowerPage = Math.max(1, state.borrowerPage + delta);
    renderBorrowersTable(_currentBorrowerFilter);
}

function filterBorrowersTable() {
    state.borrowerPage = 1;
    const filterVal = document.getElementById('borrower-status-filter').value;
    const query = (document.getElementById('borrower-search')?.value || '').toLowerCase().trim();

    let filtered = state.borrowers;
    if (filterVal !== 'ALL') filtered = filtered.filter(b => b.status === filterVal);
    if (query) {
        filtered = filtered.filter(b =>
            (b.code    || '').toLowerCase().includes(query) ||
            (b.enName  || '').toLowerCase().includes(query) ||
            (b.khName  || '').toLowerCase().includes(query) ||
            (b.phone   || '').toLowerCase().includes(query) ||
            (b.idNo    || '').toLowerCase().includes(query)
        );
    }
    const isUnfiltered = filterVal === 'ALL' && !query;
    renderBorrowersTable(isUnfiltered ? null : filtered);
}

function handleTableAction(code, action) {
    if (action === 'Loan') {
        switchTab('open-loan');
        resetLoanApplication();
        document.getElementById('loan-borrower-select').value = code;
        updateBorrowerInfoPreview();
    } else if (action === 'Edit') {
        openEditBorrower(code);
    } else {
        showToast(`Action '${action}' for Customer ${code} triggered (Mock operation)`, 'info');
    }
}

function openEditBorrower(code) {
    const borrower = state.borrowers.find(b => b.code === code);
    if (!borrower) return;
    state.editingBorrowerCode = code;

    const modal = document.getElementById('borrower-wizard-modal');
    const card = document.getElementById('borrower-wizard-card');
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    const wizardTitle = card.querySelector('h3');
    if (wizardTitle) wizardTitle.textContent = `Edit Borrower — ${borrower.enName}`;
    state.wizardStep = 1;
    wizardStepChange(0);

    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    setVal('w-cust-code', borrower.code);
    setVal('w-kh-name', borrower.khName);
    setVal('w-en-name', borrower.enName);
    setVal('w-gender', borrower.gender);
    setVal('w-marital-status', borrower.maritalStatus);
    setVal('w-dob', borrower.dob);
    setVal('w-id-type', borrower.idType);
    setVal('w-id-no', borrower.idNo);
    setVal('w-phone', borrower.phone);
    setVal('w-email', borrower.email);
    const setAddr = (prefix, addr) => {
        if (!addr || typeof addr !== 'object') return;
        setVal(`w-${prefix}-province`, addr.province || '');
        populateDistricts(prefix);
        setTimeout(() => {
            setVal(`w-${prefix}-district`, addr.district || '');
            populateCommunes(prefix);
            setTimeout(() => setVal(`w-${prefix}-commune`, addr.commune || ''), 50);
        }, 50);
        setVal(`w-${prefix}-village`, addr.village || '');
        setVal(`w-${prefix}-house`, addr.house || '');
        setVal(`w-${prefix}-street`, addr.street || '');
    };
    setAddr('cur', borrower.currentAddress);
    setAddr('perm', borrower.permanentAddress);
    setVal('w-occupation', borrower.occupation);
    setVal('w-employment-status', borrower.employmentStatus);
    setVal('w-monthly-income', borrower.monthlyIncome);
    setVal('w-other-income', borrower.otherIncome);
    setVal('w-collateral-type', borrower.collateralType);
    setVal('w-collateral-value', borrower.collateralValue);
    setVal('w-collateral-doc-no', borrower.collateralDocNo);
    setVal('w-collateral-desc', borrower.collateralDescription);

    // Reset toggles first, then turn on if data exists
    resetOptionalSections();

    const co = borrower.coBorrower || {};
    if (co.enName || co.khName) {
        const coToggle = document.getElementById('toggle-co-borrower');
        if (coToggle) { coToggle.checked = true; toggleCoBorrowerSection(); }
    }
    setVal('w-co-kh-name', co.khName); setVal('w-co-en-name', co.enName);
    setVal('w-co-dob', co.dob); setVal('w-co-gender', co.gender);
    setVal('w-co-id-type', co.idType); setVal('w-co-id', co.idNo);
    setVal('w-co-relation', co.relation); setVal('w-co-phone', co.phone);
    setVal('w-co-email', co.email); setVal('w-co-marital-status', co.maritalStatus);
    setVal('w-co-current-address', co.currentAddress); setVal('w-co-permanent-address', co.permanentAddress);
    setVal('w-co-occupation', co.occupation); setVal('w-co-employment-status', co.employmentStatus);
    setVal('w-co-monthly-income', co.monthlyIncome); setVal('w-co-other-income', co.otherIncome);

    const g = borrower.guarantor || {};
    if (g.enName || g.khName) {
        const guarToggle = document.getElementById('toggle-guarantor');
        if (guarToggle) { guarToggle.checked = true; toggleGuarantorSection(); }
    }
    setVal('w-guar-kh-name', g.khName); setVal('w-guar-en-name', g.enName);
    setVal('w-guar-dob', g.dob); setVal('w-guar-gender', g.gender);
    setVal('w-guar-id-type', g.idType); setVal('w-guar-id-no', g.idNo);
    setVal('w-guar-relation', g.relation); setVal('w-guar-phone', g.phone);
    setVal('w-guar-email', g.email);
    setVal('w-guar-current-address', g.currentAddress);
    setVal('w-guar-permanent-address', g.permanentAddress);

    showToast(`Editing profile for ${borrower.enName}`, 'info');
}

function confirmDeleteBorrower(code) {
    const borrower = state.borrowers.find(b => b.code === code);
    if (!borrower) return;
    state.deletePendingCode = code;
    const nameEl = document.getElementById('confirm-delete-name');
    if (nameEl) nameEl.textContent = `${borrower.enName} (${code})`;
    const modal = document.getElementById('confirm-delete-modal');
    if (modal) { modal.classList.remove('hidden'); lucide.createIcons(); }
}

function deleteBorrower() {
    const code = state.deletePendingCode;
    if (!code) return;
    state.borrowers = state.borrowers.filter(b => b.code !== code);
    state.deletePendingCode = null;
    const modal = document.getElementById('confirm-delete-modal');
    if (modal) modal.classList.add('hidden');
    renderBorrowersTable();
    renderBorrowerSelectDropdown();
    updateTotalBorrowerCountBadge();
    renderDashboard();
    saveState();
    showToast('Borrower record deleted successfully.', 'success');
}

function cancelDeleteBorrower() {
    state.deletePendingCode = null;
    const modal = document.getElementById('confirm-delete-modal');
    if (modal) modal.classList.add('hidden');
}

function openBorrowerPreview(code) {
    const borrower = state.borrowers.find(b => b.code === code);
    if (!borrower) return;

    // Header
    document.getElementById('preview-modal-title').textContent = borrower.enName || 'Borrower Profile';
    document.getElementById('preview-modal-code').textContent = `${borrower.code}${borrower.khName ? ' · ' + borrower.khName : ''}`;
    document.getElementById('preview-avatar').textContent = (borrower.enName || '?').charAt(0);

    const statusStyles = {
        'Active':   'bg-emerald-50 text-emerald-700 border-emerald-200',
        'Approved': 'bg-brand-50 text-brand-700 border-brand-200',
        'Pending':  'bg-amber-50 text-amber-700 border-amber-200'
    };
    const badge = document.getElementById('preview-status-badge');
    badge.textContent = borrower.status || 'N/A';
    badge.className = `px-2.5 py-1 rounded-lg text-xs font-bold border ${statusStyles[borrower.status] || 'bg-slate-100 text-slate-600 border-slate-200'}`;

    const co = borrower.coBorrower || {};
    const guar = borrower.guarantor || {};
    const hasCo = !!(co.enName || co.khName);
    const hasGuar = !!(guar.enName || guar.khName);

    const emptyBadge = '<span class="ml-1 bg-slate-100 text-slate-400 text-[9px] px-1.5 py-0.5 rounded-full font-medium">empty</span>';

    // Tab bar
    document.getElementById('preview-tab-bar').innerHTML = `
        <button id="preview-tab-btn-borrower" onclick="switchBorrowerTab('borrower')"
            class="flex items-center gap-1.5 px-5 py-3 text-xs font-semibold border-b-2 border-brand-600 text-brand-700 transition-colors whitespace-nowrap">
            <i data-lucide="user" class="w-3.5 h-3.5"></i> Borrower
        </button>
        <button id="preview-tab-btn-coborrower" onclick="switchBorrowerTab('coborrower')"
            class="flex items-center gap-1.5 px-5 py-3 text-xs font-semibold border-b-2 border-transparent text-slate-500 hover:text-slate-700 transition-colors whitespace-nowrap">
            <i data-lucide="users" class="w-3.5 h-3.5"></i> Co-Borrower${!hasCo ? emptyBadge : ''}
        </button>
        <button id="preview-tab-btn-guarantor" onclick="switchBorrowerTab('guarantor')"
            class="flex items-center gap-1.5 px-5 py-3 text-xs font-semibold border-b-2 border-transparent text-slate-500 hover:text-slate-700 transition-colors whitespace-nowrap">
            <i data-lucide="shield-check" class="w-3.5 h-3.5"></i> Guarantor${!hasGuar ? emptyBadge : ''}
        </button>
    `;

    // Tab panes
    document.getElementById('preview-all-content').innerHTML = `
        <!-- TAB 1: BORROWER -->
        <div id="preview-tab-pane-borrower" class="p-6 space-y-5">
            <div>
                <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Personal</p>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    ${buildPreviewField('Full Name (EN)', borrower.enName)}
                    ${buildPreviewField('Full Name (KH)', borrower.khName)}
                    ${buildPreviewField('Gender', borrower.gender)}
                    ${buildPreviewField('Marital Status', borrower.maritalStatus)}
                    ${buildPreviewField('Date of Birth', borrower.dob)}
                </div>
            </div>
            <div>
                <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Identification &amp; Contact</p>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    ${buildPreviewField('ID Type', borrower.idType)}
                    ${buildPreviewField('ID Number', borrower.idNo)}
                    ${buildPreviewField('Phone', borrower.phone)}
                    ${buildPreviewField('Email', borrower.email)}
                </div>
            </div>
            <div>
                <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Address</p>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    ${buildPreviewField('Current Address', formatAddress(borrower.currentAddress), true)}
                    ${buildPreviewField('Permanent Address', formatAddress(borrower.permanentAddress), true)}
                </div>
            </div>
            <div>
                <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Employment &amp; Income</p>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    ${buildPreviewField('Occupation', borrower.occupation)}
                    ${buildPreviewField('Employment Status', borrower.employmentStatus)}
                    ${buildPreviewField('Monthly Income', borrower.monthlyIncome ? '$' + Number(borrower.monthlyIncome).toLocaleString() : null)}
                    ${buildPreviewField('Other Income', borrower.otherIncome ? '$' + Number(borrower.otherIncome).toLocaleString() : null)}
                </div>
            </div>
            <div>
                <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Collateral</p>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    ${buildPreviewField('Collateral Type', borrower.collateralType)}
                    ${buildPreviewField('Estimated Value', borrower.collateralValue ? '$' + Number(borrower.collateralValue).toLocaleString() : null)}
                    ${buildPreviewField('Document / Title No.', borrower.collateralDocNo)}
                    ${buildPreviewField('Description', borrower.collateralDescription, true)}
                </div>
            </div>
            <div>
                <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
                    <i data-lucide="paperclip" class="w-3 h-3 text-brand-500"></i> Supporting Documents
                </p>
                ${(borrower.documents && borrower.documents.length) ? `
                <div class="space-y-1.5">
                    ${borrower.documents.map(doc => `
                    <div class="flex items-center gap-3 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl">
                        <i data-lucide="file-text" class="w-4 h-4 text-brand-500 flex-shrink-0"></i>
                        <div class="min-w-0 flex-1">
                            <p class="text-xs font-bold text-slate-700 truncate">${doc.type}</p>
                            <p class="text-[10px] text-slate-400 truncate">${doc.name} &middot; ${doc.size} KB</p>
                        </div>
                    </div>`).join('')}
                </div>` : `
                <p class="text-xs text-slate-400 italic">No supporting documents uploaded.</p>`}
            </div>
        </div>

        <!-- TAB 2: CO-BORROWER -->
        <div id="preview-tab-pane-coborrower" class="hidden p-6 space-y-5">
            ${hasCo ? `
            <div>
                <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Personal</p>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    ${buildPreviewField('Full Name (EN)', co.enName)}
                    ${buildPreviewField('Full Name (KH)', co.khName)}
                    ${buildPreviewField('Gender', co.gender)}
                    ${buildPreviewField('Marital Status', co.maritalStatus)}
                    ${buildPreviewField('Date of Birth', co.dob)}
                    ${buildPreviewField('Relation to Borrower', co.relation)}
                </div>
            </div>
            <div>
                <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Identification &amp; Contact</p>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    ${buildPreviewField('ID Type', co.idType)}
                    ${buildPreviewField('ID Number', co.idNo)}
                    ${buildPreviewField('Phone', co.phone)}
                    ${buildPreviewField('Email', co.email)}
                </div>
            </div>
            <div>
                <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Address</p>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    ${buildPreviewField('Current Address', co.currentAddress, true)}
                    ${buildPreviewField('Permanent Address', co.permanentAddress, true)}
                </div>
            </div>
            <div>
                <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Employment &amp; Income</p>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    ${buildPreviewField('Occupation', co.occupation)}
                    ${buildPreviewField('Employment Status', co.employmentStatus)}
                    ${buildPreviewField('Monthly Income', co.monthlyIncome ? '$' + Number(co.monthlyIncome).toLocaleString() : null)}
                    ${buildPreviewField('Other Income', co.otherIncome ? '$' + Number(co.otherIncome).toLocaleString() : null)}
                </div>
            </div>` : `
            <div class="flex flex-col items-center justify-center py-16 text-slate-400">
                <i data-lucide="users" class="w-10 h-10 mb-3 text-slate-300"></i>
                <p class="text-sm font-medium text-slate-400">No co-borrower recorded</p>
            </div>`}
        </div>

        <!-- TAB 3: GUARANTOR -->
        <div id="preview-tab-pane-guarantor" class="hidden p-6 space-y-5">
            ${hasGuar ? `
            <div>
                <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Personal</p>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    ${buildPreviewField('Full Name (EN)', guar.enName)}
                    ${buildPreviewField('Full Name (KH)', guar.khName)}
                    ${buildPreviewField('Gender', guar.gender)}
                    ${buildPreviewField('Date of Birth', guar.dob)}
                    ${buildPreviewField('Relation to Borrower', guar.relation)}
                </div>
            </div>
            <div>
                <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Identification &amp; Contact</p>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    ${buildPreviewField('ID Type', guar.idType)}
                    ${buildPreviewField('ID Number', guar.idNo)}
                    ${buildPreviewField('Phone', guar.phone)}
                    ${buildPreviewField('Email', guar.email)}
                </div>
            </div>
            <div>
                <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Address</p>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    ${buildPreviewField('Current Address', formatAddress(guar.currentAddress), true)}
                    ${buildPreviewField('Permanent Address', formatAddress(guar.permanentAddress), true)}
                </div>
            </div>` : `
            <div class="flex flex-col items-center justify-center py-16 text-slate-400">
                <i data-lucide="shield-check" class="w-10 h-10 mb-3 text-slate-300"></i>
                <p class="text-sm font-medium text-slate-400">No guarantor recorded</p>
            </div>`}
        </div>
    `;

    document.getElementById('borrower-preview-modal').classList.remove('hidden');
    document.getElementById('preview-all-content').scrollTop = 0;
    lucide.createIcons();
}

function switchBorrowerTab(tabId) {
    ['borrower', 'coborrower', 'guarantor'].forEach(id => {
        const btn = document.getElementById(`preview-tab-btn-${id}`);
        const pane = document.getElementById(`preview-tab-pane-${id}`);
        const isActive = id === tabId;
        if (btn) {
            btn.classList.toggle('border-brand-600', isActive);
            btn.classList.toggle('text-brand-700', isActive);
            btn.classList.toggle('border-transparent', !isActive);
            btn.classList.toggle('text-slate-500', !isActive);
        }
        if (pane) pane.classList.toggle('hidden', !isActive);
    });
    const content = document.getElementById('preview-all-content');
    if (content) content.scrollTop = 0;
}

function buildPreviewField(label, value, wide = false) {
    const display = (value !== null && value !== undefined && String(value).trim()) ? value : '<span class="text-slate-350">—</span>';
    return `<div class="${wide ? 'sm:col-span-2' : ''} bg-slate-50 rounded-xl p-3 border border-slate-100">
        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">${label}</p>
        <p class="text-xs font-semibold text-slate-700 leading-relaxed">${display}</p>
    </div>`;
}

function buildPreviewEmpty(message) {
    return `<div class="flex flex-col items-center justify-center py-14 text-slate-400">
        <i data-lucide="user-x" class="w-10 h-10 mb-3 text-slate-300"></i>
        <p class="text-sm font-medium">${message}</p>
    </div>`;
}

function closeBorrowerPreviewModal() {
    document.getElementById('borrower-preview-modal').classList.add('hidden');
}

function renderBorrowerSelectDropdown() {
    const select = document.getElementById('loan-borrower-select');
    select.innerHTML = '';
    state.borrowers.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.code;
        opt.text = `${b.code} - ${b.enName}${b.khName ? ` (${b.khName})` : ''}`;
        select.appendChild(opt);
    });
}

function updateTotalBorrowerCountBadge() {
    document.getElementById('count-borrowers').innerText = state.borrowers.length;
}

// --- 7. NEW APPLICATION WIZARD & AMORTIZATION ENGINE ---

const approvalStageMeta = [
    { title: 'Loan Officer Screening', approver: 'Vireak Both' },
    { title: 'Branch Manager Review', approver: 'Chan Mony' },
    { title: 'Credit Manager Sign-off', approver: 'Srey Neang' }
];

function initLoanApplicationDates() {
    const today = new Date().toISOString().split('T')[0];
    const firstInst = new Date();
    firstInst.setMonth(firstInst.getMonth() + 1);
    const firstInstStr = firstInst.toISOString().split('T')[0];
    const disbEl = document.getElementById('loan-disbursement-date');
    const firstEl = document.getElementById('loan-first-installment');
    if (disbEl && !disbEl.value) disbEl.value = today;
    if (firstEl && !firstEl.value) firstEl.value = firstInstStr;
}

// Open wizard modal for a fresh new application
function openLoanWizard() {
    state.loanWizardStep = 1;
    state.loanSubmitted = false;
    state.activeLoan = null;
    state.approvalState = 1;
    state.approvalHistory = [];
    const lf = document.getElementById('loan-init-form');
    if (lf) lf.reset();
    initLoanApplicationDates();
    loanWizardStepChange(0);
    updateBorrowerInfoPreview();
    document.getElementById('loan-wizard-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    lucide.createIcons();
}

// Close wizard modal — back to list
function closeLoanWizard() {
    document.getElementById('loan-wizard-modal').classList.add('hidden');
    document.body.style.overflow = '';
    state.editingLoanRef = null;
    const title = document.querySelector('#loan-wizard-card h3');
    if (title) title.textContent = 'New Loan Application';
    renderLoanApplicationsList();
    lucide.createIcons();
}

// Back to list from review panel
function backToLoanList() {
    document.getElementById('loan-review-panel').classList.add('hidden');
    document.getElementById('loan-applications-list-panel').classList.remove('hidden');
    renderLoanApplicationsList();
    lucide.createIcons();
}

function showLoanReviewPanel() {
    document.getElementById('loan-applications-list-panel').classList.add('hidden');
    document.getElementById('loan-review-panel').classList.remove('hidden');
    lucide.createIcons();
}

// Open an existing application from the list
function openLoanDetail(idx) {
    const app = state.loanApplications[idx];
    if (!app) return;
    state.activeLoan = app;
    state.approvalState = app.approvalState || 1;
    state.approvalHistory = app.approvalHistory || [];
    state.loanSubmitted = true;
    showLoanReviewPanel();
    document.getElementById('loan-app-ref').textContent = app.ref;
    calculateAmortizationSchedule();
    renderRepaymentTracking();
    renderApprovalTimeline();
    renderApprovalHistory();
    updateDisburseButton();
    updateSchedulePrintMeta();
    lucide.createIcons();
}

let _loanDetailModalIdx = null;

function openLoanDetailModal(idx) {
    const app = state.loanApplications[idx];
    if (!app) return;
    _loanDetailModalIdx = idx;

    const statusMap = {
        'Pending Approval': 'bg-amber-50 text-amber-700 border-amber-200/60',
        'Approved':         'bg-emerald-50 text-emerald-700 border-emerald-200/60',
        'Disbursed':        'bg-brand-50 text-brand-700 border-brand-200/60',
        'Rejected':         'bg-rose-50 text-rose-700 border-rose-200/60',
    };
    const amount = Number(app.amount || 0).toLocaleString('en-US', { style: 'currency', currency: app.currency || 'USD', minimumFractionDigits: 0 });

    document.getElementById('loan-detail-modal-title').textContent = app.borrowerName || 'Loan Detail';
    document.getElementById('loan-detail-modal-ref').textContent = `${app.ref || '—'}${app.borrowerCode ? ' · ' + app.borrowerCode : ''}`;
    const badge = document.getElementById('loan-detail-status-badge');
    badge.textContent = app.status || 'N/A';
    badge.className = `px-2.5 py-1 rounded-lg text-xs font-bold border ${statusMap[app.status] || 'bg-slate-100 text-slate-600 border-slate-200'}`;

    document.getElementById('loan-detail-content').innerHTML = `
        <div>
            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Borrower</p>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                ${buildPreviewField('Full Name', app.borrowerName)}
                ${buildPreviewField('Khmer Name', app.borrowerKhName)}
                ${buildPreviewField('Gender', app.borrowerGender)}
                ${buildPreviewField('Phone', app.borrowerPhone)}
                ${buildPreviewField('Email', app.borrowerEmail)}
            </div>
        </div>
        <div>
            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Loan Terms</p>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                ${buildPreviewField('Product', app.product)}
                ${buildPreviewField('Amount', amount)}
                ${buildPreviewField('Interest Rate', app.interestRate ? app.interestRate + '%' : null)}
                ${buildPreviewField('Penalty Rate', app.penaltyRate ? app.penaltyRate + '%' : null)}
                ${buildPreviewField('Repayment Type', app.repaymentType)}
                ${buildPreviewField('Installments', app.installments)}
                ${buildPreviewField('First Installment', app.firstInstallment)}
                ${buildPreviewField('Disbursement Date', app.disbursementDate)}
                ${buildPreviewField('Loan Cycle', app.loanCycle)}
            </div>
        </div>
        <div>
            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Credit Info</p>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                ${buildPreviewField('Credit Officer', app.creditOfficer)}
                ${buildPreviewField('Branch', app.branch)}
                ${buildPreviewField('Collateral', app.collateral)}
                ${buildPreviewField('Reason for Credit', app.reasonCredit, true)}
                ${buildPreviewField('Memo / Notes', app.memoReason, true)}
            </div>
        </div>
    `;

    document.getElementById('loan-detail-modal').classList.remove('hidden');
    document.getElementById('loan-detail-content').scrollTop = 0;
    lucide.createIcons();
}

function closeLoanDetailModal() {
    document.getElementById('loan-detail-modal').classList.add('hidden');
    _loanDetailModalIdx = null;
}

function viewScheduleFromLoanDetail() {
    const idx = _loanDetailModalIdx;
    closeLoanDetailModal();
    if (idx !== null) openLoanDetail(idx);
}

function openLoanEdit(idx) {
    const app = state.loanApplications[idx];
    if (!app) return;
    if (app.status === 'Disbursed') {
        showToast('Disbursed loans cannot be edited.', 'info');
        return;
    }

    // Reset form so no stale values from a previous session persist
    const lf = document.getElementById('loan-init-form');
    if (lf) lf.reset();
    initLoanApplicationDates();

    state.editingLoanRef = app.ref;
    state.loanWizardStep = 1;
    state.loanSubmitted = false;

    // Open modal
    document.getElementById('loan-wizard-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Update title
    const title = document.querySelector('#loan-wizard-card h3');
    if (title) title.textContent = `Edit Application — ${app.ref}`;

    // Go to step 1
    loanWizardStepChange(0);

    // Pre-fill all fields
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el && val !== undefined && val !== null) el.value = val;
    };

    // Step 1 — Borrower
    setVal('loan-borrower-select', app.borrowerCode);
    updateBorrowerInfoPreview();

    // Step 2 — Loan Info
    setVal('loan-product-type',      app.product);
    setVal('loan-currency-type',     app.currency);
    setVal('loan-amount',            app.amount);
    setVal('loan-disbursement-date', app.disbursementDate);
    setVal('loan-repayment-type',    app.repaymentType);
    setVal('loan-first-installment', app.firstInstallment);
    setVal('loan-installments',      app.installments);
    setVal('loan-rate',              app.interestRate);
    setVal('loan-penalty-rate',      app.penaltyRate);

    // Step 3 — Details
    setVal('loan-credit-officer', app.creditOfficer);
    setVal('loan-collateral',     app.collateral);
    setVal('loan-cycle',          app.loanCycle);
    setVal('loan-branch',         app.branch);
    setVal('loan-reason-credit',  app.reasonCredit);
    setVal('loan-memo-reason',    app.memoReason);

    lucide.createIcons();
}

function renderLoanApplicationsList() {
    const tbody = document.getElementById('loan-app-list-rows');
    const empty = document.getElementById('loan-app-list-empty');
    const badge = document.getElementById('loan-app-count-badge');
    if (!tbody) return;

    const query = (document.getElementById('loan-app-search')?.value || '').toLowerCase().trim();
    const apps = query
        ? state.loanApplications.filter(a =>
            (a.ref          || '').toLowerCase().includes(query) ||
            (a.borrowerName || '').toLowerCase().includes(query) ||
            (a.borrowerCode || '').toLowerCase().includes(query) ||
            (a.product      || '').toLowerCase().includes(query) ||
            (a.status       || '').toLowerCase().includes(query)
          )
        : state.loanApplications;

    if (badge) badge.textContent = `${apps.length} Application${apps.length !== 1 ? 's' : ''}`;

    if (!apps.length) {
        tbody.innerHTML = '';
        if (empty) empty.classList.remove('hidden');
        return;
    }
    if (empty) empty.classList.add('hidden');

    tbody.innerHTML = apps.map((app, idx) => {
        const statusMap = {
            'Pending Approval': { cls: 'bg-amber-50 text-amber-700 border-amber-200/60', label: 'Pending' },
            'Approved':         { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200/60', label: 'Approved' },
            'Disbursed':        { cls: 'bg-brand-50 text-brand-700 border-brand-200/60', label: 'Disbursed' },
            'Rejected':         { cls: 'bg-rose-50 text-rose-700 border-rose-200/60', label: 'Rejected' },
        };
        const st = statusMap[app.status] || { cls: 'bg-slate-100 text-slate-600', label: app.status };
        const amount = Number(app.amount || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 });
        const submitted = app.submittedAt ? new Date(app.submittedAt).toLocaleDateString('en-GB') : '—';
        return `<tr class="hover:bg-slate-50/50 cursor-pointer transition-colors" onclick="openLoanDetailModal(${idx})">
            <td class="py-3 px-5 font-mono font-bold text-brand-700 text-xs">${app.ref || '—'}</td>
            <td class="py-3 px-5">
              <p class="font-semibold text-slate-800 text-xs">${app.borrowerName || '—'}</p>
              <p class="text-[10px] text-slate-400 font-medium">${app.borrowerCode || ''}</p>
            </td>
            <td class="py-3 px-5 text-xs text-slate-600">${app.product || '—'}</td>
            <td class="py-3 px-5 text-xs font-bold text-slate-800 text-right font-mono">${amount}</td>
            <td class="py-3 px-5 text-xs text-slate-500">${submitted}</td>
            <td class="py-3 px-5 text-center">
              <span class="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold border ${st.cls}">${st.label}</span>
            </td>
            <td class="py-3 px-5 text-center">
              <div class="flex items-center justify-center gap-1.5">
                <button onclick="event.stopPropagation(); openLoanDetailModal(${idx})" title="View Loan Detail"
                  class="p-1.5 bg-brand-50 hover:bg-brand-100 text-brand-600 rounded-lg border border-brand-200/50 transition-colors">
                  <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                </button>
                ${app.status !== 'Disbursed' ? `
                <button onclick="event.stopPropagation(); openLoanEdit(${idx})" title="Edit"
                  class="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-600 rounded-lg border border-amber-200/60 transition-colors">
                  <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                </button>` : `
                <span class="p-1.5 invisible" aria-hidden="true">
                  <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                </span>`}
              </div>
            </td>
          </tr>`;
    }).join('');
    lucide.createIcons();
}

// Legacy alias — kept in case called from elsewhere
function resetLoanApplication() { openLoanWizard(); }

function loanWizardStepChange(stepDelta) {
    const newStep = state.loanWizardStep + stepDelta;
    if (newStep < 1 || newStep > 3) return;

    if (stepDelta > 0 && !validateLoanWizardStep(state.loanWizardStep)) return;

    for (let i = 1; i <= 3; i++) {
        document.getElementById(`loan-wizard-step-${i}-content`).classList.add('hidden');
    }
    document.getElementById(`loan-wizard-step-${newStep}-content`).classList.remove('hidden');

    for (let i = 1; i <= 3; i++) {
        const bubble = document.getElementById(`loan-wizard-step-${i}-bubble`);
        const label = document.getElementById(`loan-wizard-step-${i}-label`);
        if (i < newStep) {
            bubble.className = "w-8 h-8 rounded-full bg-emerald-500 text-white font-bold text-xs flex items-center justify-center ring-4 ring-emerald-100 transition-all duration-200";
            label.className = "text-xs font-bold text-slate-800";
        } else if (i === newStep) {
            bubble.className = "w-8 h-8 rounded-full bg-brand-600 text-white font-bold text-xs flex items-center justify-center ring-4 ring-brand-100/80 transition-all duration-200";
            label.className = "text-xs font-bold text-slate-800";
        } else {
            bubble.className = "w-8 h-8 rounded-full bg-slate-200 text-slate-600 font-bold text-xs flex items-center justify-center transition-all duration-200";
            label.className = "text-xs font-semibold text-slate-400";
        }
    }

    const line1 = document.getElementById('loan-wizard-line-1');
    const line2 = document.getElementById('loan-wizard-line-2');
    if (line1) line1.className = `w-16 h-0.5 mx-3 flex-shrink-0 ${newStep > 1 ? 'bg-emerald-500' : 'bg-slate-200'}`;
    if (line2) line2.className = `w-16 h-0.5 mx-3 flex-shrink-0 ${newStep > 2 ? 'bg-emerald-500' : 'bg-slate-200'}`;

    const prevBtn = document.getElementById('loan-wizard-prev-btn');
    const nextBtn = document.getElementById('loan-wizard-next-btn');
    const submitBtn = document.getElementById('loan-wizard-submit-btn');

    prevBtn.classList.toggle('hidden', newStep === 1);
    nextBtn.classList.toggle('hidden', newStep === 3);
    submitBtn.classList.toggle('hidden', newStep !== 3);

    state.loanWizardStep = newStep;
    if (newStep === 2) calculateAmortizationSchedule();
    lucide.createIcons();
}

function validateLoanWizardStep(step) {
    if (step === 1) {
        const code = document.getElementById('loan-borrower-select').value;
        if (!code) {
            showToast('Please select a borrower.', 'error');
            return false;
        }
    }
    if (step === 2) {
        const amount = parseFloat(document.getElementById('loan-amount').value);
        const rate = parseFloat(document.getElementById('loan-rate').value);
        if (!amount || amount <= 0 || !rate || rate <= 0) {
            showToast('Please enter valid loan amount and interest rate.', 'error');
            return false;
        }
        if (!document.getElementById('loan-disbursement-date').value || !document.getElementById('loan-first-installment').value) {
            showToast('Please set disbursement and first installment dates.', 'error');
            return false;
        }
    }
    return true;
}

function updateBorrowerInfoPreview() {
    const code = document.getElementById('loan-borrower-select')?.value;
    const borrower = state.borrowers.find(b => b.code === code);
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '—'; };

    if (!borrower) {
        ['loan-preview-en', 'loan-preview-kh', 'loan-preview-id', 'loan-preview-phone', 'loan-preview-email'].forEach(id => set(id, '—'));
        const statusEl = document.getElementById('loan-preview-status');
        if (statusEl) statusEl.textContent = '—';
        return;
    }

    set('loan-preview-en', borrower.enName);
    set('loan-preview-kh', borrower.khName);
    set('loan-preview-id', `${borrower.idType} — ${borrower.idNo}`);
    set('loan-preview-phone', borrower.phone);
    set('loan-preview-email', borrower.email || '—');

    const statusEl = document.getElementById('loan-preview-status');
    if (statusEl) {
        let badge = 'bg-slate-100 text-slate-700';
        if (borrower.status === 'Active') badge = 'bg-emerald-50 text-emerald-700';
        else if (borrower.status === 'Approved') badge = 'bg-brand-50 text-brand-700';
        else if (borrower.status === 'Pending') badge = 'bg-amber-50 text-amber-700';
        statusEl.innerHTML = `<span class="inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${badge}">${borrower.status}</span>`;
    }
}

function handleLoanCurrencyChange() {
    const curr = document.getElementById('loan-currency-type').value;
    state.currency = curr;
    const sym = document.getElementById('loan-currency-symbol');
    const lbl = document.getElementById('loan-currency-label');
    if (curr === 'USD') {
        sym.innerText = '$';
        lbl.innerText = 'USD';
    } else {
        sym.innerText = '៛';
        lbl.innerText = 'KHR';
    }
    calculateAmortizationSchedule();
}

function buildAmortizationData() {
    const amount = parseFloat(document.getElementById('loan-amount')?.value) || 0;
    const annualRate = parseFloat(document.getElementById('loan-rate')?.value) || 0;
    const termMonths = parseInt(document.getElementById('loan-installments')?.value) || 12;
    const firstInstStr = document.getElementById('loan-first-installment')?.value;

    if (amount <= 0 || annualRate <= 0) return { emi: 0, rows: [] };

    const monthlyRate = (annualRate / 100) / 12;
    const emi = (amount * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1);

    let remainingBalance = amount;
    let startDate = firstInstStr ? new Date(firstInstStr + 'T00:00:00') : new Date();
    const rows = [];

    for (let i = 1; i <= termMonths; i++) {
        const interestPaid = remainingBalance * monthlyRate;
        const principalPaid = emi - interestPaid;
        remainingBalance -= principalPaid;
        const dispRemaining = i === termMonths ? 0 : Math.max(0, remainingBalance);
        const installmentDate = new Date(startDate);
        installmentDate.setMonth(installmentDate.getMonth() + (i - 1));
        const formattedDate = installmentDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

        rows.push({
            num: i,
            dueDate: formattedDate,
            dueDateISO: installmentDate.toISOString().split('T')[0],
            dueDatePrint: formatSchedulePrintDate(installmentDate),
            principal: principalPaid,
            interest: interestPaid,
            colFee: 0,
            totalDue: emi,
            balance: dispRemaining,
            penaltyPayoff: 0,
            paid: 0,
            status: 'Upcoming'
        });
    }

    return { emi, rows };
}

function calculateAmortizationSchedule() {
    const { emi, rows } = buildAmortizationData();
    const tableBody = document.getElementById('schedule-table-rows');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    const emiEl = document.getElementById('schedule-emi');
    if (emiEl) emiEl.innerText = emi > 0 ? formatVal(emi) : '--';
    if (emi <= 0) return;

    rows.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50/50 transition-all duration-100";
        tr.innerHTML = `
            <td class="py-2.5 px-6 font-mono font-semibold">${row.num}</td>
            <td class="py-2.5 px-6">${row.dueDate}</td>
            <td class="py-2.5 px-6 font-mono">${formatVal(row.principal)}</td>
            <td class="py-2.5 px-6 font-mono text-rose-500">${formatVal(row.interest)}</td>
            <td class="py-2.5 px-6 font-mono text-slate-800 font-bold">${formatVal(row.totalDue)}</td>
            <td class="py-2.5 px-6 font-mono text-brand-700 font-bold">${formatVal(row.balance)}</td>
        `;
        tableBody.appendChild(tr);
    });
}

function submitLoanApplication(event) {
    event.preventDefault();
    if (!validateLoanWizardStep(3)) return;

    const { emi, rows } = buildAmortizationData();
    const borrowerCode = document.getElementById('loan-borrower-select').value;
    const borrower = state.borrowers.find(b => b.code === borrowerCode);

    const isEditing = !!state.editingLoanRef;
    const existingApp = isEditing ? state.loanApplications.find(a => a.ref === state.editingLoanRef) : null;
    const loanRef = isEditing ? state.editingLoanRef : `AC-L-${String(Date.now()).slice(-6)}`;

    state.activeLoan = {
        ref: loanRef,
        borrowerCode,
        borrowerName: borrower?.enName || borrowerCode,
        borrowerKhName: borrower?.khName || '',
        borrowerGender: borrower?.gender || '—',
        borrowerAddress: borrower?.currentAddress || '—',
        borrowerEmail: borrower?.email || '',
        borrowerPhone: borrower?.phone || '',
        product: document.getElementById('loan-product-type').value,
        currency: document.getElementById('loan-currency-type').value,
        amount: parseFloat(document.getElementById('loan-amount').value),
        disbursementDate: document.getElementById('loan-disbursement-date').value,
        repaymentType: document.getElementById('loan-repayment-type').value,
        firstInstallment: document.getElementById('loan-first-installment').value,
        installments: parseInt(document.getElementById('loan-installments').value),
        interestRate: parseFloat(document.getElementById('loan-rate').value),
        penaltyRate: parseFloat(document.getElementById('loan-penalty-rate').value),
        creditOfficer: document.getElementById('loan-credit-officer').value,
        collateral: document.getElementById('loan-collateral').value,
        loanCycle: document.getElementById('loan-cycle').value,
        branch: document.getElementById('loan-branch').value,
        reasonCredit: document.getElementById('loan-reason-credit').value,
        memoReason: document.getElementById('loan-memo-reason').value,
        emi,
        schedule: rows,
        status: isEditing ? (existingApp?.status || 'Pending Approval') : 'Pending Approval',
        submittedAt: isEditing ? (existingApp?.submittedAt || new Date().toISOString()) : new Date().toISOString(),
        updatedAt: isEditing ? new Date().toISOString() : undefined
    };

    state.loanSubmitted = true;
    state.approvalState = isEditing ? (existingApp?.approvalState || 1) : 1;
    state.approvalHistory = isEditing ? (existingApp?.approvalHistory || []) : [];
    if (!isEditing) {
        state.approvalHistory = [{
            stage: 1,
            action: 'Application submitted',
            user: state.activeLoan.creditOfficer,
            timestamp: new Date().toLocaleString('en-GB')
        }];
    } else {
        state.approvalHistory.push({
            stage: state.approvalState,
            action: 'Application updated',
            user: state.activeLoan.creditOfficer,
            timestamp: new Date().toLocaleString('en-GB')
        });
    }
    state.activeLoan.approvalState = state.approvalState;
    state.activeLoan.approvalHistory = state.approvalHistory;
    state.editingLoanRef = null;

    // Add to or update the applications list
    const existingIdx = state.loanApplications.findIndex(a => a.ref === loanRef);
    if (existingIdx >= 0) {
        state.loanApplications[existingIdx] = state.activeLoan;
    } else {
        state.loanApplications.unshift(state.activeLoan);
    }
    saveState();

    // Close the loan wizard modal
    document.getElementById('loan-wizard-modal').classList.add('hidden');
    document.body.style.overflow = '';
    // Show review panel in main content
    showLoanReviewPanel();
    document.getElementById('loan-app-ref').textContent = loanRef;

    calculateAmortizationSchedule();
    renderRepaymentTracking();
    renderApprovalTimeline();
    renderApprovalHistory();
    updateDisburseButton();
    updateSchedulePrintMeta();

    showToast(isEditing ? `Application ${loanRef} updated.` : `Application ${loanRef} submitted for approval.`, 'success');
    lucide.createIcons();
}

function renderRepaymentTracking() {
    const body = document.getElementById('repayment-tracking-rows');
    if (!body || !state.activeLoan) return;

    body.innerHTML = '';
    const today = new Date().toISOString().split('T')[0];
    let paidCount = 0;
    let dueCount = 0;

    state.activeLoan.schedule.forEach((row, idx) => {
        if (row.status === 'Paid') paidCount++;
        else if (row.dueDateISO <= today) {
            row.status = row.status === 'Upcoming' ? 'Due' : row.status;
            if (row.status === 'Due' || row.status === 'Overdue') dueCount++;
        }

        let statusBadge = 'bg-slate-100 text-slate-600';
        if (row.status === 'Paid') statusBadge = 'bg-emerald-50 text-emerald-700';
        else if (row.status === 'Due') statusBadge = 'bg-amber-50 text-amber-700';
        else if (row.status === 'Overdue') statusBadge = 'bg-rose-50 text-rose-700';

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/50';
        tr.innerHTML = `
            <td class="py-2 px-4 font-mono font-semibold">${row.num}</td>
            <td class="py-2 px-4">${row.dueDate}</td>
            <td class="py-2 px-4 font-mono font-bold">${formatVal(row.totalDue)}</td>
            <td class="py-2 px-4 font-mono text-emerald-600">${row.paid > 0 ? formatVal(row.paid) : '—'}</td>
            <td class="py-2 px-4"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${statusBadge}">${row.status}</span></td>
            <td class="py-2 px-4 text-center">
                ${row.status !== 'Paid' ? `<button type="button" onclick="recordRepayment(${idx})" class="px-2 py-1 bg-brand-50 hover:bg-brand-100 text-brand-700 text-[10px] font-bold rounded-lg border border-brand-200 transition-all">Record</button>` : '<span class="text-[10px] text-slate-400">—</span>'}
            </td>
        `;
        body.appendChild(tr);
    });

    const outstanding = state.activeLoan.schedule
        .filter(r => r.status !== 'Paid')
        .reduce((acc, r) => acc + r.totalDue - r.paid, 0);

    document.getElementById('repay-track-paid').textContent = paidCount;
    document.getElementById('repay-track-due').textContent = dueCount;
    document.getElementById('repay-track-outstanding').textContent = formatVal(outstanding);
}

function recordRepayment(scheduleIdx) {
    if (!state.activeLoan) return;
    const row = state.activeLoan.schedule[scheduleIdx];
    if (!row || row.status === 'Paid') return;

    row.paid = row.totalDue;
    row.status = 'Paid';
    row.paidDate = new Date().toISOString().split('T')[0];

    state.incomes.unshift({
        category: 'Repayment Income',
        amount: row.totalDue,
        code: `RP-${state.activeLoan.ref}`,
        date: row.paidDate
    });

    renderRepaymentTracking();
    updateLiveCurrencyOutputs();
    showToast(`Installment #${row.num} payment of ${formatVal(row.totalDue)} recorded.`, 'success');
}

function formatSchedulePrintAmount(amount) {
    return Number(amount).toFixed(2);
}

function formatSchedulePrintDate(dateInput) {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput + 'T00:00:00');
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
}

const KHMER_WEEKDAYS = ['អាទិត្យ', 'ច័ន្ទ', 'អង្គារ', 'ពុធ', 'ព្រហស្បតិ៍', 'សុក្រ', 'សៅរ៍'];

function formatScheduleRepaymentDate(dateInput) {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput + 'T00:00:00');
    const dayName = KHMER_WEEKDAYS[d.getDay()];
    return `${dayName} ${formatSchedulePrintDate(d)}`;
}

function mapLoanCycleLabel(cycle) {
    if (cycle === '1') return 'New';
    return `Cycle ${cycle}`;
}

function toLidRef(loanRef) {
    const digits = (loanRef || '').replace(/\D/g, '').slice(-6).padStart(6, '0');
    return `LID-${digits}`;
}

function renderSchedulePrintForm() {
    if (!state.activeLoan) return;
    const loan = state.activeLoan;
    const borrower = state.borrowers.find(b => b.code === loan.borrowerCode);
    const todayStr = formatSchedulePrintDate(new Date());

    const form = document.getElementById('schedule-print-form');
    if (form) {
        form.classList.remove('spf-compact', 'spf-dense');
        if (loan.installments > 24) form.classList.add('spf-dense');
        else if (loan.installments > 12) form.classList.add('spf-compact');
    }

    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val ?? '—';
    };

    set('spf-acc-no', toLidRef(loan.ref));
    set('spf-cid', loan.borrowerCode);
    set('spf-name', loan.borrowerKhName || borrower?.khName || loan.borrowerName);
    set('spf-sex', (loan.borrowerGender || borrower?.gender || '—').toUpperCase());
    set('spf-tel', (loan.borrowerPhone || borrower?.phone || '—').replace(/\s/g, ''));
    set('spf-purpose', loan.reasonCredit || '—');
    set('spf-amount', `${loan.currency} ${formatSchedulePrintAmount(loan.amount)}`);
    set('spf-disb-date', formatSchedulePrintDate(loan.disbursementDate));
    set('spf-rate', `${(loan.interestRate / 100).toFixed(2)} %`);
    set('spf-period', `${loan.installments} Monthly`);
    set('spf-loan-seq', mapLoanCycleLabel(loan.loanCycle));
    set('spf-admin-fee', '0.00 % = 0.00');
    set('spf-refinance-fee', '0.00');
    set('spf-co', loan.creditOfficer);
    set('spf-address', loan.borrowerAddress || borrower?.currentAddress || '—');
    set('spf-footer-date-left', todayStr);
    set('spf-footer-date-right', todayStr);

    const printBody = document.getElementById('schedule-print-table-rows');
    if (!printBody) return;
    printBody.innerHTML = '';

    let totalPrincipal = 0;
    loan.schedule.forEach(row => {
        totalPrincipal += row.principal;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.num}</td>
            <td>${row.dueDatePrint || formatScheduleRepaymentDate(row.dueDateISO)}</td>
            <td>${formatSchedulePrintAmount(row.principal)}</td>
            <td>${formatSchedulePrintAmount(row.interest)}</td>
            <td>${formatSchedulePrintAmount(row.colFee || 0)}</td>
            <td class="spf-col-total">${formatSchedulePrintAmount(row.totalDue)}</td>
            <td>${formatSchedulePrintAmount(row.balance)}</td>
            <td>${formatSchedulePrintAmount(row.penaltyPayoff || 0)}</td>
        `;
        printBody.appendChild(tr);
    });

    set('spf-total-principal', formatSchedulePrintAmount(totalPrincipal));
}

function updateSchedulePrintMeta() {
    renderSchedulePrintForm();
}

function getSchedulePrintStyles(densityClass = '') {
    const densityRules = densityClass === 'spf-dense' ? `
        .schedule-print-form { font-size: 8.5pt; }
        .schedule-print-form .spf-logo { width: 14mm; height: 14mm; }
        .schedule-print-form .spf-logo-spacer { width: 14mm; }
        .schedule-print-form .spf-table { font-size: 7.5pt; }
        .schedule-print-form .spf-table th,
        .schedule-print-form .spf-table td { padding: 2pt 2pt; }
    ` : densityClass === 'spf-compact' ? `
        .schedule-print-form { font-size: 9.5pt; }
        .schedule-print-form .spf-table { font-size: 8.5pt; }
        .schedule-print-form .spf-table th,
        .schedule-print-form .spf-table td { padding: 3pt 2pt; }
    ` : '';

    return `
        @page { size: A4 portrait; margin: 10mm 12mm; }
        * { box-sizing: border-box; }
        html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            background: #fff;
            color: #000;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        body {
            font-family: "Khmer OS", "Khmer OS System", "Noto Sans Khmer", Arial, sans-serif;
        }
        .schedule-print-form {
            width: 100%;
            max-width: 100%;
            font-size: 10.5pt;
            line-height: 1.35;
            color: #000;
        }
        .spf-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            margin-bottom: 10pt;
            page-break-inside: avoid;
        }
        .spf-logo { width: 18mm; height: 18mm; object-fit: contain; }
        .spf-logo-spacer { width: 18mm; flex-shrink: 0; }
        .spf-title-block { text-align: center; flex: 1; }
        .spf-kh-title { font-size: 12pt; font-weight: 700; margin: 0; }
        .spf-en-title { font-size: 15pt; font-weight: 700; margin: 2pt 0; letter-spacing: 0.3pt; }
        .spf-doc-title { font-size: 11pt; font-weight: 700; margin: 4pt 0 0; text-decoration: underline; }
        .spf-meta {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 3pt 20pt;
            margin-bottom: 8pt;
            page-break-inside: avoid;
        }
        .spf-meta-col { display: flex; flex-direction: column; gap: 2pt; }
        .spf-row, .spf-address {
            display: flex;
            gap: 6pt;
            line-height: 1.35;
            font-size: 9.5pt;
        }
        .spf-label { white-space: nowrap; flex-shrink: 0; }
        .spf-value { font-weight: 600; flex: 1; }
        .spf-address { margin-bottom: 8pt; page-break-inside: avoid; }
        .spf-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            font-size: 9.5pt;
            margin-top: 6pt;
        }
        .spf-table th, .spf-table td {
            border: 1px solid #000;
            padding: 4pt 3pt;
            text-align: center;
            vertical-align: middle;
            word-wrap: break-word;
        }
        .spf-table th { font-weight: 700; line-height: 1.2; font-size: 8.5pt; }
        .spf-table th span { font-weight: 600; font-size: 8pt; display: block; }
        .spf-table td.spf-col-total { font-weight: 700; }
        .spf-table tfoot td { border: 1px solid #000; font-weight: 700; }
        .spf-table thead { display: table-header-group; }
        .spf-table tr { page-break-inside: avoid; }
        .spf-table th:nth-child(1), .spf-table td:nth-child(1) { width: 5%; }
        .spf-table th:nth-child(2), .spf-table td:nth-child(2) { width: 17%; }
        .spf-table th:nth-child(3), .spf-table td:nth-child(3) { width: 11%; }
        .spf-table th:nth-child(4), .spf-table td:nth-child(4) { width: 11%; }
        .spf-table th:nth-child(5), .spf-table td:nth-child(5) { width: 11%; }
        .spf-table th:nth-child(6), .spf-table td:nth-child(6) { width: 11%; }
        .spf-table th:nth-child(7), .spf-table td:nth-child(7) { width: 13%; }
        .spf-table th:nth-child(8), .spf-table td:nth-child(8) { width: 21%; }
        .spf-footer {
            display: flex;
            justify-content: space-between;
            margin-top: 14pt;
            font-size: 10pt;
            page-break-inside: avoid;
        }
        ${densityRules}
    `;
}

function buildSchedulePrintHtml(formEl) {
    const densityClass = formEl.classList.contains('spf-dense') ? 'spf-dense'
        : formEl.classList.contains('spf-compact') ? 'spf-compact' : '';
    const logoUrl = new URL('assets/acabar-logo.png', window.location.href).href;
    const formContent = formEl.innerHTML.replace(/assets\/acabar-logo\.png/g, logoUrl);
    const title = state.activeLoan?.ref || 'Repayment Schedule';

    return `<!DOCTYPE html>
<html lang="km">
<head>
    <meta charset="UTF-8" />
    <title>Repayment Schedule - ${title}</title>
    <style>${getSchedulePrintStyles(densityClass)}</style>
</head>
<body>
    <div class="schedule-print-form ${densityClass}">${formContent}</div>
</body>
</html>`;
}

function printRepaymentSchedule() {
    if (!state.activeLoan) {
        showToast('Submit an application first to print the schedule.', 'error');
        return;
    }
    renderSchedulePrintForm();

    const form = document.getElementById('schedule-print-form');
    if (!form) return;

    const html = buildSchedulePrintHtml(form);

    let iframe = document.getElementById('schedule-print-iframe');
    if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'schedule-print-iframe';
        iframe.setAttribute('title', 'Repayment schedule print');
        iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden;';
        document.body.appendChild(iframe);
    }

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    const triggerPrint = () => {
        try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
        } catch (err) {
            showToast('Unable to open the print dialog.', 'error');
        }
    };

    // Allow layout and logo image to render before printing
    setTimeout(triggerPrint, 400);
}

function sendScheduleToBorrower() {
    if (!state.activeLoan) {
        showToast('Submit an application first to send the schedule.', 'error');
        return;
    }
    const loan = state.activeLoan;
    const contact = loan.borrowerEmail || loan.borrowerPhone;
    if (!contact) {
        showToast('Borrower has no email or phone on file.', 'error');
        return;
    }
    showToast(`Repayment schedule for ${loan.ref} sent to ${contact}.`, 'success');
    state.approvalHistory.push({
        stage: 0,
        action: `Schedule sent to borrower (${contact})`,
        user: 'System',
        timestamp: new Date().toLocaleString('en-GB')
    });
    renderApprovalHistory();
}

function setApprovalState(clickedStage) {
    if (!state.activeLoan) {
        showToast('Submit a loan application first.', 'info');
        return;
    }
    if (state.activeLoan.status === 'Approved' || state.activeLoan.status === 'Disbursed') {
        showToast('Loan is already fully approved.', 'info');
        return;
    }
    if (clickedStage < state.approvalState) {
        showToast('Cannot revert a completed approval stage.', 'info');
        return;
    }
    if (clickedStage > state.approvalState) {
        showToast('Complete the current approval stage first.', 'error');
        return;
    }

    const meta = approvalStageMeta[clickedStage - 1];
    state.approvalHistory.push({
        stage: clickedStage,
        action: `Approved — ${meta.title}`,
        user: meta.approver,
        timestamp: new Date().toLocaleString('en-GB')
    });

    if (clickedStage === 3) {
        state.activeLoan.status = 'Approved';
    } else {
        state.approvalState = clickedStage + 1;
    }
    // Sync back to applications list
    if (state.activeLoan) {
        state.activeLoan.approvalState = state.approvalState;
        state.activeLoan.approvalHistory = state.approvalHistory;
        const idx = state.loanApplications.findIndex(a => a.ref === state.activeLoan.ref);
        if (idx >= 0) state.loanApplications[idx] = state.activeLoan;
    }

    renderApprovalTimeline();
    renderApprovalHistory();
    updateDisburseButton();
    saveState();
    showToast(`${meta.title} approved by ${meta.approver}.`, 'success');
}

function renderApprovalTimeline() {
    const current = state.approvalState;
    const fullyApproved = state.activeLoan?.status === 'Approved' || state.activeLoan?.status === 'Disbursed';

    for (let i = 1; i <= 3; i++) {
        const node = document.getElementById(`timeline-node-${i}`);
        const status = document.getElementById(`timeline-node-${i}-status`);
        const timeEl = document.getElementById(`timeline-node-${i}-time`);
        const meta = approvalStageMeta[i - 1];
        const historyEntry = state.approvalHistory.find(h => h.stage === i && h.action.includes('Approved'));

        const isApproved = fullyApproved || i < current || (historyEntry && i <= current);
        const isActive = !fullyApproved && i === current;

        if (isApproved) {
            node.className = "w-10 h-10 rounded-xl bg-emerald-500 border border-emerald-600 text-white flex items-center justify-center z-10 transition-all duration-200 shadow-md";
            node.innerHTML = `<i data-lucide="check" class="w-5 h-5"></i>`;
            status.className = "text-[10px] text-emerald-600 font-semibold mt-0.5";
            status.innerText = `Approved (${meta.approver})`;
        } else if (isActive) {
            node.className = "w-10 h-10 rounded-xl bg-amber-500 border border-amber-600 text-white flex items-center justify-center z-10 transition-all duration-200 shadow-md";
            node.innerHTML = `<i data-lucide="loader" class="w-5 h-5 animate-spin"></i>`;
            status.className = "text-[10px] text-amber-600 font-bold mt-0.5";
            status.innerText = `Under Review (${meta.approver})`;
        } else {
            node.className = "w-10 h-10 rounded-xl bg-slate-200 border border-slate-300 text-slate-500 flex items-center justify-center z-10 transition-all duration-200";
            node.innerHTML = `<i data-lucide="lock" class="w-4 h-4"></i>`;
            status.className = "text-[10px] text-slate-400 mt-0.5";
            status.innerText = 'Locked';
        }

        if (timeEl && historyEntry) {
            timeEl.textContent = historyEntry.timestamp;
            timeEl.classList.remove('hidden');
        } else if (timeEl) {
            timeEl.classList.add('hidden');
        }
    }
    lucide.createIcons();
}

function renderApprovalHistory() {
    const log = document.getElementById('approval-history-log');
    if (!log) return;
    if (!state.approvalHistory.length) {
        log.innerHTML = '<p class="text-slate-400 italic">No activity yet.</p>';
        return;
    }
    log.innerHTML = state.approvalHistory.slice().reverse().map(h => `
        <div class="p-2 bg-slate-50 rounded-lg border border-slate-100">
            <span class="font-bold text-slate-700">${h.action}</span>
            <span class="text-slate-400"> — ${h.user}</span>
            <div class="text-slate-400 mt-0.5">${h.timestamp}</div>
        </div>
    `).join('');
}

function updateDisburseButton() {
    const btn = document.getElementById('btn-disburse-loan');
    if (!btn) return;
    const fullyApproved = state.approvalState >= 3 && state.activeLoan?.status === 'Approved';
    if (fullyApproved) {
        btn.disabled = false;
        btn.className = "w-full mt-5 py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm rounded-xl border border-brand-700/25 shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer";
        btn.innerHTML = `<i data-lucide="banknote" class="w-4 h-4"></i> Disburse Loan`;
    } else {
        btn.disabled = true;
        btn.className = "w-full mt-5 py-3 bg-slate-200 text-slate-400 font-bold text-sm rounded-xl cursor-not-allowed flex items-center justify-center gap-2";
        btn.innerHTML = `<i data-lucide="banknote" class="w-4 h-4"></i> Disburse (Awaiting Approval)`;
    }
    lucide.createIcons();
}

function handleDisburseSimulation() {
    if (!state.activeLoan || state.activeLoan.status !== 'Approved') {
        showToast('Loan must be fully approved before disbursement.', 'error');
        return;
    }

    const loan = state.activeLoan;
    showToast(`Disbursed ${formatVal(loan.amount)} for ${loan.borrowerCode} (${loan.product})`, 'success');

    const processingFee = loan.amount * 0.01;
    state.incomes.unshift({
        category: 'Repayment Fee Income',
        amount: processingFee,
        code: `FEE-${loan.ref}`,
        date: new Date().toISOString().split('T')[0]
    });

    const borrowerIndex = state.borrowers.findIndex(b => b.code === loan.borrowerCode);
    if (borrowerIndex !== -1) {
        state.borrowers[borrowerIndex].status = 'Active';
        renderBorrowersTable();
    }

    loan.status = 'Disbursed';
    state.approvalHistory.push({
        stage: 0,
        action: `Loan disbursed — ${formatVal(loan.amount)}`,
        user: 'System',
        timestamp: new Date().toLocaleString('en-GB')
    });
    // Sync to loan applications list
    const lIdx = state.loanApplications.findIndex(a => a.ref === loan.ref);
    if (lIdx >= 0) { state.loanApplications[lIdx] = loan; state.loanApplications[lIdx].approvalHistory = state.approvalHistory; }
    renderApprovalHistory();
    updateLiveCurrencyOutputs();
    saveState();
}

// --- 8. ACCOUNTING & LEDGER MODULE ---
function switchAccountingSubTab(tab) {
    const allTabs = ['income', 'expense', 'reports', 'cash-transfer', 'chart-of-accounts', 'general-ledger', 'trial-balance'];
    allTabs.forEach(t => {
        const panel = document.getElementById(`acct-panel-${t}`);
        if (panel) panel.classList.toggle('hidden', t !== tab);
    });
    if (tab === 'reports') { setStatementTab(state.activeStatement || 'pl'); renderAccountingStatements(); }
    if (tab === 'cash-transfer') renderCashTransfers();
    if (tab === 'chart-of-accounts') renderChartOfAccounts();
    if (tab === 'general-ledger') renderGeneralLedger();
    if (tab === 'trial-balance') renderTrialBalance();
    lucide.createIcons();
}

// ── CASH TRANSFER ──────────────────────────────────────────
function openCashTransferModal() {
    const opts = state.chartOfAccounts.map(a => `<option value="${a.code}">${a.code} — ${a.name}</option>`).join('');
    document.getElementById('ct-from-account').innerHTML = opts;
    document.getElementById('ct-to-account').innerHTML = opts;
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('ct-date').value = today;
    document.getElementById('ct-ref').value = `CT-${String(Date.now()).slice(-6)}`;
    document.getElementById('ct-amount').value = '';
    document.getElementById('ct-description').value = '';
    document.getElementById('cash-transfer-modal').classList.remove('hidden');
    lucide.createIcons();
}

function closeCashTransferModal() {
    document.getElementById('cash-transfer-modal').classList.add('hidden');
}

function submitCashTransfer() {
    const fromCode = document.getElementById('ct-from-account').value;
    const toCode   = document.getElementById('ct-to-account').value;
    const amount   = parseFloat(document.getElementById('ct-amount').value);
    const date     = document.getElementById('ct-date').value;
    if (!fromCode || !toCode || !amount || amount <= 0) { showToast('Please fill in all required fields.', 'error'); return; }
    if (fromCode === toCode) { showToast('From and To accounts must be different.', 'error'); return; }
    const fromAcc = state.chartOfAccounts.find(a => a.code === fromCode);
    const toAcc   = state.chartOfAccounts.find(a => a.code === toCode);
    state.cashTransfers.push({
        ref: document.getElementById('ct-ref').value,
        date,
        fromCode, fromName: fromAcc?.name || fromCode,
        toCode,   toName:   toAcc?.name   || toCode,
        amount,
        description: document.getElementById('ct-description').value
    });
    if (fromAcc) fromAcc.balance = Math.max(0, (fromAcc.balance || 0) - amount);
    if (toAcc)   toAcc.balance   = (toAcc.balance   || 0) + amount;
    saveState();
    closeCashTransferModal();
    renderCashTransfers();
    showToast(`Transfer of ${formatVal(amount)} recorded successfully.`, 'success');
}

function renderCashTransfers() {
    const tbody   = document.getElementById('cash-transfers-list');
    const emptyEl = document.getElementById('cash-transfers-empty');
    if (!tbody) return;
    tbody.innerHTML = '';
    const list = state.cashTransfers || [];
    if (list.length === 0) { if (emptyEl) emptyEl.classList.remove('hidden'); return; }
    if (emptyEl) emptyEl.classList.add('hidden');
    [...list].reverse().forEach(t => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/50 transition-colors';
        tr.innerHTML = `
            <td class="py-3.5 px-6 text-xs text-slate-500 font-mono">${t.date}</td>
            <td class="py-3.5 px-6"><span class="text-[10px] font-mono font-semibold bg-brand-50 text-brand-700 border border-brand-200/50 px-2 py-0.5 rounded-md">${t.ref}</span></td>
            <td class="py-3.5 px-6 text-xs font-semibold text-slate-700">${t.fromCode} — ${t.fromName}</td>
            <td class="py-3.5 px-6 text-xs font-semibold text-slate-700">${t.toCode} — ${t.toName}</td>
            <td class="py-3.5 px-6 text-xs text-slate-400">${t.description || '—'}</td>
            <td class="py-3.5 px-6 text-right font-mono text-sm font-bold text-brand-600">${formatVal(t.amount)}</td>`;
        tbody.appendChild(tr);
    });
}

// ── CHART OF ACCOUNTS ───────────────────────────────────────
let _coaFilter = 'all';

function filterChartOfAccounts(type) {
    _coaFilter = type;
    const sel = document.getElementById('coa-type-filter');
    if (sel) sel.value = type;
    renderChartOfAccounts();
}

function renderChartOfAccounts() {
    const tbody = document.getElementById('chart-of-accounts-list');
    if (!tbody) return;
    tbody.innerHTML = '';
    const accounts = _coaFilter === 'all'
        ? state.chartOfAccounts
        : state.chartOfAccounts.filter(a => a.type === _coaFilter);
    const typeStyle = {
        Asset:     'bg-blue-50 text-blue-700 border-blue-200/50',
        Liability: 'bg-amber-50 text-amber-700 border-amber-200/50',
        Equity:    'bg-violet-50 text-violet-700 border-violet-200/50',
        Revenue:   'bg-emerald-50 text-emerald-700 border-emerald-200/50',
        Expense:   'bg-rose-50 text-rose-700 border-rose-200/50'
    };
    let lastType = null;
    accounts.forEach(acc => {
        if (acc.type !== lastType) {
            lastType = acc.type;
            const gr = document.createElement('tr');
            gr.className = 'bg-slate-50/80';
            gr.innerHTML = `<td colspan="6" class="py-2 px-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-t border-slate-100">${acc.type}</td>`;
            tbody.appendChild(gr);
        }
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/50 transition-colors';
        tr.innerHTML = `
            <td class="py-3 px-6 font-mono text-xs font-bold text-slate-600">${acc.code}</td>
            <td class="py-3 px-6 text-xs font-semibold text-slate-800">${acc.name}</td>
            <td class="py-3 px-6"><span class="text-[10px] font-bold border px-2 py-0.5 rounded-full ${typeStyle[acc.type] || 'bg-slate-100 text-slate-500'}">${acc.type}</span></td>
            <td class="py-3 px-6 text-xs font-semibold text-slate-500">${acc.normalBal}</td>
            <td class="py-3 px-6 text-right font-mono text-sm font-bold text-slate-800">${formatVal(acc.balance || 0)}</td>
            <td class="py-3 px-6">
                <div class="flex items-center justify-center gap-2">
                    <button onclick="openAccountModal('${acc.code}')" class="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
                    <button onclick="deleteChartAccount('${acc.code}')" class="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
                </div>
            </td>`;
        tbody.appendChild(tr);
    });
    lucide.createIcons();
}

function autoSetNormalBalance() {
    const type = document.getElementById('coa-modal-type').value;
    const debitTypes = ['Asset', 'Expense'];
    const nb = document.getElementById('coa-modal-normal-bal');
    if (nb) nb.value = debitTypes.includes(type) ? 'Debit' : 'Credit';
}

function openAccountModal(code) {
    const acc = code ? state.chartOfAccounts.find(a => a.code === code) : null;
    document.getElementById('account-modal-title').textContent = acc ? 'Edit Account' : 'Add New Account';
    document.getElementById('coa-modal-editing-code').value = code || '';
    document.getElementById('coa-modal-code').value    = acc?.code    || '';
    document.getElementById('coa-modal-name').value    = acc?.name    || '';
    document.getElementById('coa-modal-type').value    = acc?.type    || 'Asset';
    document.getElementById('coa-modal-normal-bal').value = acc?.normalBal || 'Debit';
    document.getElementById('coa-modal-balance').value = acc?.balance != null ? acc.balance : '';
    document.getElementById('account-modal').classList.remove('hidden');
    lucide.createIcons();
}

function closeAccountModal() {
    document.getElementById('account-modal').classList.add('hidden');
}

function submitChartAccount() {
    const editCode = document.getElementById('coa-modal-editing-code').value;
    const code  = document.getElementById('coa-modal-code').value.trim();
    const name  = document.getElementById('coa-modal-name').value.trim();
    const type  = document.getElementById('coa-modal-type').value;
    const nb    = document.getElementById('coa-modal-normal-bal').value;
    const bal   = parseFloat(document.getElementById('coa-modal-balance').value) || 0;
    if (!code || !name) { showToast('Account code and name are required.', 'error'); return; }
    if (editCode) {
        const idx = state.chartOfAccounts.findIndex(a => a.code === editCode);
        if (idx !== -1) state.chartOfAccounts[idx] = { code, name, type, normalBal: nb, balance: bal };
        showToast('Account updated.', 'success');
    } else {
        if (state.chartOfAccounts.find(a => a.code === code)) { showToast(`Account code ${code} already exists.`, 'error'); return; }
        state.chartOfAccounts.push({ code, name, type, normalBal: nb, balance: bal });
        state.chartOfAccounts.sort((a, b) => a.code.localeCompare(b.code));
        showToast('Account added.', 'success');
    }
    saveState();
    closeAccountModal();
    renderChartOfAccounts();
}

function deleteChartAccount(code) {
    const acc = state.chartOfAccounts.find(a => a.code === code);
    if (!acc) return;
    if (!confirm(`Delete "${acc.code} — ${acc.name}"? This cannot be undone.`)) return;
    state.chartOfAccounts = state.chartOfAccounts.filter(a => a.code !== code);
    saveState();
    renderChartOfAccounts();
    showToast('Account deleted.', 'success');
}

// ── GENERAL LEDGER ──────────────────────────────────────────
function renderGeneralLedger() {
    const filter = document.getElementById('gl-filter-type')?.value || 'all';
    let entries = [];
    state.incomes.forEach(i =>
        entries.push({ date: i.date, ref: i.code, description: i.category, type: 'Income', debit: 0, credit: i.amount }));
    state.expenses.forEach(e =>
        entries.push({ date: e.date, ref: e.code, description: e.category, type: 'Expense', debit: e.amount, credit: 0 }));
    (state.cashTransfers || []).forEach(t =>
        entries.push({ date: t.date, ref: t.ref, description: `Transfer: ${t.fromName} → ${t.toName}${t.description ? ' · ' + t.description : ''}`, type: 'Transfer', debit: t.amount, credit: t.amount }));
    entries.sort((a, b) => b.date.localeCompare(a.date));
    if (filter !== 'all') entries = entries.filter(e => e.type === filter);
    const tbody = document.getElementById('general-ledger-list');
    if (!tbody) return;
    tbody.innerHTML = '';
    let totalDebit = 0, totalCredit = 0;
    const typeBadge = {
        Income:   'bg-emerald-50 text-emerald-700 border border-emerald-200/50',
        Expense:  'bg-rose-50 text-rose-700 border border-rose-200/50',
        Transfer: 'bg-brand-50 text-brand-700 border border-brand-200/50'
    };
    entries.forEach(e => {
        totalDebit  += e.debit;
        totalCredit += e.credit;
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/50 transition-colors';
        tr.innerHTML = `
            <td class="py-3.5 px-6 text-xs text-slate-500 font-mono">${e.date}</td>
            <td class="py-3.5 px-6"><span class="text-[10px] font-mono font-semibold bg-slate-50 text-slate-600 border border-slate-200/50 px-2 py-0.5 rounded-md">${e.ref}</span></td>
            <td class="py-3.5 px-6 text-xs font-semibold text-slate-700">${e.description}</td>
            <td class="py-3.5 px-6"><span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${typeBadge[e.type] || ''}">${e.type}</span></td>
            <td class="py-3.5 px-6 text-right font-mono text-xs font-semibold ${e.debit ? 'text-rose-600' : 'text-slate-300'}">${e.debit ? formatVal(e.debit) : '—'}</td>
            <td class="py-3.5 px-6 text-right font-mono text-xs font-semibold ${e.credit ? 'text-emerald-600' : 'text-slate-300'}">${e.credit ? formatVal(e.credit) : '—'}</td>`;
        tbody.appendChild(tr);
    });
    const glD = document.getElementById('gl-total-debit');
    const glC = document.getElementById('gl-total-credit');
    if (glD) glD.textContent = formatVal(totalDebit);
    if (glC) glC.textContent = formatVal(totalCredit);
}

// ── TRIAL BALANCE ───────────────────────────────────────────
function renderTrialBalance() {
    const tbody = document.getElementById('trial-balance-list');
    if (!tbody) return;
    tbody.innerHTML = '';
    let totalDebit = 0, totalCredit = 0;
    const typeOrder = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
    const typeStyle = {
        Asset: 'bg-blue-50/50', Liability: 'bg-amber-50/50',
        Equity: 'bg-violet-50/50', Revenue: 'bg-emerald-50/50', Expense: 'bg-rose-50/50'
    };
    typeOrder.forEach(type => {
        const group = state.chartOfAccounts.filter(a => a.type === type);
        if (group.length === 0) return;
        const gr = document.createElement('tr');
        gr.className = typeStyle[type] || 'bg-slate-50/50';
        gr.innerHTML = `<td colspan="4" class="py-2 px-5 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-t border-slate-100">${type}</td>`;
        tbody.appendChild(gr);
        group.forEach(acc => {
            const isDebit = acc.normalBal === 'Debit';
            const debit   = isDebit ? (acc.balance || 0) : 0;
            const credit  = !isDebit ? (acc.balance || 0) : 0;
            totalDebit  += debit;
            totalCredit += credit;
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50/50 transition-colors';
            tr.innerHTML = `
                <td class="py-2.5 px-5 font-mono text-xs text-slate-500">${acc.code}</td>
                <td class="py-2.5 px-5 text-xs font-semibold text-slate-700">${acc.name}</td>
                <td class="py-2.5 px-5 text-right font-mono text-xs ${debit ? 'font-semibold text-slate-800' : 'text-slate-300'}">${debit ? formatVal(debit) : '—'}</td>
                <td class="py-2.5 px-5 text-right font-mono text-xs ${credit ? 'font-semibold text-slate-800' : 'text-slate-300'}">${credit ? formatVal(credit) : '—'}</td>`;
            tbody.appendChild(tr);
        });
    });
    const tbD = document.getElementById('tb-total-debit');
    const tbC = document.getElementById('tb-total-credit');
    if (tbD) tbD.textContent = formatVal(totalDebit);
    if (tbC) tbC.textContent = formatVal(totalCredit);
    const chk = document.getElementById('tb-balance-check');
    if (chk) {
        const diff = Math.abs(totalDebit - totalCredit);
        const balanced = diff < 0.01;
        chk.className = `mt-4 flex items-center justify-center gap-2 text-xs font-bold py-2.5 px-4 rounded-xl ${balanced ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`;
        chk.innerHTML = balanced
            ? `<i data-lucide="check-circle" class="w-4 h-4"></i> Balanced — Debits equal Credits`
            : `<i data-lucide="alert-triangle" class="w-4 h-4"></i> Difference of ${formatVal(diff)} — Review account balances`;
        lucide.createIcons();
    }
}

function renderAccountingGrids() {
    // Income table
    const incomeBody = document.getElementById('incomes-list');
    incomeBody.innerHTML = '';
    state.incomes.forEach(i => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/50 transition-colors';
        tr.innerHTML = `
            <td class="py-3.5 px-6 text-xs text-slate-500 font-mono">${i.date}</td>
            <td class="py-3.5 px-6 text-xs font-bold text-slate-800">${i.category}</td>
            <td class="py-3.5 px-6">
                <span class="text-[10px] font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/50 px-2 py-0.5 rounded-md">${i.code}</span>
            </td>
            <td class="py-3.5 px-6 text-right font-mono text-sm font-bold text-emerald-600">+${formatVal(i.amount)}</td>
        `;
        incomeBody.appendChild(tr);
    });

    // Expense table
    const expenseBody = document.getElementById('expenses-list');
    expenseBody.innerHTML = '';
    state.expenses.forEach(e => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/50 transition-colors';
        tr.innerHTML = `
            <td class="py-3.5 px-6 text-xs text-slate-500 font-mono">${e.date}</td>
            <td class="py-3.5 px-6 text-xs font-bold text-slate-800">${e.category}</td>
            <td class="py-3.5 px-6">
                <span class="text-[10px] font-mono font-semibold bg-rose-50 text-rose-700 border border-rose-200/50 px-2 py-0.5 rounded-md">${e.code}</span>
            </td>
            <td class="py-3.5 px-6 text-right font-mono text-sm font-bold text-rose-600">-${formatVal(e.amount)}</td>
        `;
        expenseBody.appendChild(tr);
    });

    // Loan disbursement banner
    const banner = document.getElementById('loan-income-banner');
    if (banner && state.activeLoan) {
        const loanInterest = state.activeLoan.schedule
            ? state.activeLoan.schedule.reduce((s, r) => s + (r.interest || 0), 0)
            : 0;
        document.getElementById('banner-loan-ref').textContent = state.activeLoan.ref;
        document.getElementById('banner-borrower').textContent = state.activeLoan.borrowerName;
        document.getElementById('banner-principal').textContent = formatVal(state.activeLoan.amount);
        document.getElementById('banner-interest').textContent = formatVal(loanInterest);
        banner.classList.remove('hidden');
    } else if (banner) {
        banner.classList.add('hidden');
    }

    // KPI cards
    const totalIncome = state.incomes.reduce((s, i) => s + i.amount, 0);
    const totalExpenses = state.expenses.reduce((s, e) => s + e.amount, 0);
    const netProfit = totalIncome - totalExpenses;
    const loanPortfolio = state.activeLoan ? 4850000 + state.activeLoan.amount : 4850000;

    document.getElementById('kpi-total-income').innerText = formatVal(totalIncome);
    document.getElementById('kpi-total-expenses').innerText = formatVal(totalExpenses);
    const netEl = document.getElementById('kpi-net-profit');
    if (netEl) netEl.innerText = formatVal(netProfit);
    const portEl = document.getElementById('kpi-loan-portfolio');
    if (portEl) portEl.innerText = formatVal(loanPortfolio);
}

function renderAccountingStatements() {
    // Loan-connected interest income from active loan schedule
    let loanInterestIncome = 0;
    let loanPortfolio = 4850000;
    if (state.activeLoan && state.activeLoan.schedule) {
        loanInterestIncome = state.activeLoan.schedule.reduce((s, r) => s + (r.interest || 0), 0);
        loanPortfolio += state.activeLoan.amount;
    }

    // Categorise income entries
    const interestInc = state.incomes.filter(i => i.category === 'Interest Income')
        .reduce((s, i) => s + i.amount, 0) + loanInterestIncome;
    const feeInc = state.incomes.filter(i => ['Repayment Fee Income', 'Repayment Income'].includes(i.category))
        .reduce((s, i) => s + i.amount, 0);
    const penaltyInc = state.incomes.filter(i => ['Penalty Fee', 'Recovery Income'].includes(i.category))
        .reduce((s, i) => s + i.amount, 0);
    const otherInc = state.incomes.filter(i => !['Interest Income', 'Repayment Fee Income', 'Repayment Income', 'Penalty Fee', 'Recovery Income'].includes(i.category))
        .reduce((s, i) => s + i.amount, 0);
    const grandTotalIncome = interestInc + feeInc + penaltyInc + otherInc;

    // Categorise expense entries
    const salaryExp = state.expenses.filter(e => ['Employment Salaries', 'Employment'].includes(e.category))
        .reduce((s, e) => s + e.amount, 0);
    const adminExp = state.expenses.filter(e => ['Office Administration', 'Operating'].includes(e.category))
        .reduce((s, e) => s + e.amount, 0);
    const taxExp = state.expenses.filter(e => ['Tax & Regulation', 'Tax'].includes(e.category))
        .reduce((s, e) => s + e.amount, 0);
    const provisionExp = state.expenses.filter(e => ['Provision Expense', 'Write-Off'].includes(e.category))
        .reduce((s, e) => s + e.amount, 0);
    const totalExpenses = salaryExp + adminExp + taxExp + provisionExp;
    const netIncome = grandTotalIncome - totalExpenses;

    // P&L
    const fmt = v => v > 0 ? formatVal(v) : '—';
    const fmtDebit = v => v > 0 ? `(${formatVal(v)})` : '—';
    document.getElementById('pl-int-income').innerText = fmt(interestInc);
    document.getElementById('pl-fees-income').innerText = fmt(feeInc);
    document.getElementById('pl-penalty-income').innerText = fmt(penaltyInc);
    document.getElementById('pl-other-income').innerText = fmt(otherInc);
    document.getElementById('pl-total-revenue').innerText = formatVal(grandTotalIncome);
    document.getElementById('pl-salaries-exp').innerText = fmtDebit(salaryExp);
    document.getElementById('pl-admin-exp').innerText = fmtDebit(adminExp);
    document.getElementById('pl-tax-exp').innerText = fmtDebit(taxExp);
    document.getElementById('pl-provisions-exp').innerText = fmtDebit(provisionExp);
    document.getElementById('pl-total-exp').innerText = fmtDebit(totalExpenses);
    document.getElementById('pl-net-income').innerText = formatVal(netIncome);

    // Balance Sheet
    const provision = provisionExp || 50000;
    const baseCash = 1245600;
    const updatedCash = baseCash + netIncome;
    const totalAssets = updatedCash + loanPortfolio - provision;
    document.getElementById('bs-cash').innerText = formatVal(updatedCash);
    document.getElementById('bs-portfolio').innerText = formatVal(loanPortfolio);
    document.getElementById('bs-provision').innerText = `(${formatVal(provision)})`;
    document.getElementById('bs-total-assets').innerText = formatVal(totalAssets);
    document.getElementById('bs-borrowings').innerText = formatVal(2500000);
    document.getElementById('bs-payables').innerText = formatVal(361850);
    document.getElementById('bs-capital').innerText = formatVal(3000000);
    document.getElementById('bs-earnings').innerText = formatVal(netIncome);
    document.getElementById('bs-total-liab-equity').innerText = formatVal(totalAssets);
}

function setStatementTab(tab) {
    state.activeStatement = tab;
    const btnPl = document.getElementById('btn-state-pl');
    const btnBs = document.getElementById('btn-state-bs');
    const plPanel = document.getElementById('statement-pl-panel');
    const bsPanel = document.getElementById('statement-bs-panel');

    if (tab === 'pl') {
        btnPl.className = "px-3.5 py-1 text-xs font-bold rounded-md transition-all duration-250 bg-white text-slate-850 shadow-sm border border-slate-200/20";
        btnBs.className = "px-3.5 py-1 text-xs font-bold rounded-md transition-all duration-250 text-slate-500 hover:text-slate-800";
        plPanel.classList.remove('hidden');
        bsPanel.classList.add('hidden');
    } else {
        btnBs.className = "px-3.5 py-1 text-xs font-bold rounded-md transition-all duration-250 bg-white text-slate-850 shadow-sm border border-slate-200/20";
        btnPl.className = "px-3.5 py-1 text-xs font-bold rounded-md transition-all duration-250 text-slate-500 hover:text-slate-800";
        bsPanel.classList.remove('hidden');
        plPanel.classList.add('hidden');
    }
}

function openRecordTransactionModal(type) {
    const modal = document.getElementById('transaction-modal');
    const title = document.getElementById('transaction-modal-title');
    const select = document.getElementById('t-subcategory');

    title.innerText = `Record New ${type} Entry`;
    select.innerHTML = '';

    const options = type === 'Expense'
        ? ['Employment Salaries', 'Office Administration', 'Tax & Regulation', 'Provision Expense', 'Write-Off', 'Debt Collection', 'Operating']
        : ['Interest Income', 'Repayment Fee Income', 'Penalty Fee', 'Recovery Income', 'Other Income'];

    options.forEach(opt => {
        const el = document.createElement('option');
        el.value = opt;
        el.text = opt;
        select.appendChild(el);
    });

    document.getElementById('t-ref').value = `${type === 'Expense' ? 'EXP' : 'INC'}-${Math.floor(Math.random() * 899 + 100)}`;
    document.getElementById('t-amount').value = '';
    document.getElementById('t-description').value = '';
    modal.classList.remove('hidden');
}

function toggleTransactionModal(show) {
    const modal = document.getElementById('transaction-modal');
    if (show) modal.classList.remove('hidden');
    else modal.classList.add('hidden');
}

function submitTransaction() {
    const modal = document.getElementById('transaction-modal');
    const subcat = document.getElementById('t-subcategory').value;
    const amount = parseFloat(document.getElementById('t-amount').value) || 0;
    const ref = document.getElementById('t-ref').value;

    if (amount <= 0 || !ref) {
        showToast("Please input a valid amount and reference number.", "error");
        return;
    }

    const title = document.getElementById('transaction-modal-title').innerText;
    const isExpense = title.includes('Expense');

    const entry = {
        category: subcat,
        amount: amount,
        code: ref,
        date: new Date().toISOString().split('T')[0],
        description: document.getElementById('t-description').value || ''
    };

    if (isExpense) {
        state.expenses.unshift(entry);
        showToast(`Log Expense entry for ${formatVal(amount)} successful.`, 'success');
    } else {
        state.incomes.unshift(entry);
        showToast(`Log Income entry for ${formatVal(amount)} successful.`, 'success');
    }

    modal.classList.add('hidden');
    updateLiveCurrencyOutputs();
    renderDashboard();
    saveState();
}

// --- 9. LOAN REPORT MODULE ---
function switchReportTab(tab) {
    const tabs = ['active', 'repayment', 'due-today', 'arrears', 'writeoff'];
    tabs.forEach(t => {
        const btn = document.getElementById(`rpt-tab-${t}`);
        const panel = document.getElementById(`rpt-panel-${t}`);
        const active = t === tab;
        btn.classList.toggle('border-brand-500', active);
        btn.classList.toggle('text-brand-600', active);
        btn.classList.toggle('border-transparent', !active);
        btn.classList.toggle('text-slate-500', !active);
        panel.classList.toggle('hidden', !active);
    });
    if (tab === 'active') renderActiveLoanReport();
    else if (tab === 'repayment') renderRepaymentReport();
    else if (tab === 'due-today') renderDueTodayReport();
    else if (tab === 'arrears') renderPARReport();
    else if (tab === 'writeoff') renderWriteOffReport();
    lucide.createIcons();
}

function renderActiveLoanReport() {
    const products = ['Agricultural Loan', 'Business Loan', 'Personal Loan', 'Vehicle Loan', 'SME Loan'];
    const mock = [
        { ref: 'AC-L-8921', borrower: 'KEO SOPHEA', code: 'CID-01', product: 'Business Loan', disburse: '2026-01-15', maturity: '2027-01-15', principal: 5000, outstanding: 3750 },
        { ref: 'AC-L-8922', borrower: 'SENG HONG', code: 'CID-02', product: 'Agricultural Loan', disburse: '2026-02-10', maturity: '2027-02-10', principal: 3000, outstanding: 2200 },
        { ref: 'AC-L-8923', borrower: 'MUNNY ROTHANA', code: 'CID-03', product: 'Personal Loan', disburse: '2026-03-05', maturity: '2026-09-05', principal: 1500, outstanding: 600 },
        { ref: 'AC-L-8924', borrower: 'LIM KIMHOUR', code: 'CID-05', product: 'SME Loan', disburse: '2025-12-01', maturity: '2026-12-01', principal: 8000, outstanding: 5300 },
        { ref: 'AC-L-8925', borrower: 'CHAN THEARY', code: 'CID-04', product: 'Vehicle Loan', disburse: '2026-04-20', maturity: '2027-04-20', principal: 4500, outstanding: 3800 },
    ];
    const body = document.getElementById('rpt-active-rows');
    body.innerHTML = '';
    mock.forEach(r => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/50 transition-colors';
        tr.innerHTML = `
            <td class="py-3.5 px-5 font-mono text-xs font-bold text-slate-500">${r.ref}</td>
            <td class="py-3.5 px-5">
                <div class="text-xs font-bold text-slate-800">${r.borrower}</div>
                <div class="text-[10px] text-slate-400 font-mono">${r.code}</div>
            </td>
            <td class="py-3.5 px-5 text-xs text-slate-600">${r.product}</td>
            <td class="py-3.5 px-5 text-xs font-mono text-slate-500">${r.disburse}</td>
            <td class="py-3.5 px-5 text-xs font-mono text-slate-500">${r.maturity}</td>
            <td class="py-3.5 px-5 text-right font-mono text-xs font-semibold text-slate-700">${formatVal(r.principal)}</td>
            <td class="py-3.5 px-5 text-right font-mono text-xs font-bold text-brand-600">${formatVal(r.outstanding)}</td>
            <td class="py-3.5 px-5 text-center">
                <span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold border bg-emerald-50 text-emerald-700 border-emerald-200/50">Active</span>
            </td>`;
        body.appendChild(tr);
    });
}

function renderRepaymentReport() {
    const mock = [
        { ref: 'AC-L-8921', borrower: 'KEO SOPHEA', inst: 5, due: '2026-06-15', amount: 450, paid: 450, datePaid: '2026-06-14', status: 'Paid' },
        { ref: 'AC-L-8922', borrower: 'SENG HONG', inst: 4, due: '2026-06-10', amount: 270, paid: 270, datePaid: '2026-06-10', status: 'Paid' },
        { ref: 'AC-L-8923', borrower: 'MUNNY ROTHANA', inst: 3, due: '2026-06-05', amount: 260, paid: 260, datePaid: '2026-06-06', status: 'Paid' },
        { ref: 'AC-L-8924', borrower: 'LIM KIMHOUR', inst: 6, due: '2026-06-01', amount: 720, paid: 720, datePaid: '2026-06-01', status: 'Paid' },
        { ref: 'AC-L-8925', borrower: 'CHAN THEARY', inst: 2, due: '2026-06-20', amount: 395, paid: 0, datePaid: '—', status: 'Pending' },
        { ref: 'AC-L-8926', borrower: 'HENG SOPHEAK', inst: 7, due: '2026-06-18', amount: 580, paid: 580, datePaid: '2026-06-18', status: 'Paid' },
        { ref: 'AC-L-8927', borrower: 'SOK DARA', inst: 1, due: '2026-06-25', amount: 320, paid: 0, datePaid: '—', status: 'Pending' },
    ];
    const body = document.getElementById('rpt-repayment-rows');
    body.innerHTML = '';
    mock.forEach(r => {
        const isPaid = r.status === 'Paid';
        const badge = isPaid
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50'
            : 'bg-amber-50 text-amber-700 border-amber-200/50';
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/50 transition-colors';
        tr.innerHTML = `
            <td class="py-3.5 px-5 font-mono text-xs font-bold text-slate-500">${r.ref}</td>
            <td class="py-3.5 px-5 text-xs font-bold text-slate-800">${r.borrower}</td>
            <td class="py-3.5 px-5 text-center font-mono text-xs text-slate-600">#${r.inst}</td>
            <td class="py-3.5 px-5 font-mono text-xs text-slate-500">${r.due}</td>
            <td class="py-3.5 px-5 text-right font-mono text-xs font-semibold text-slate-700">${formatVal(r.amount)}</td>
            <td class="py-3.5 px-5 text-right font-mono text-xs font-bold ${isPaid ? 'text-emerald-600' : 'text-slate-400'}">${isPaid ? formatVal(r.paid) : '—'}</td>
            <td class="py-3.5 px-5 font-mono text-xs text-slate-500">${r.datePaid}</td>
            <td class="py-3.5 px-5 text-center">
                <span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold border ${badge}">${r.status}</span>
            </td>`;
        body.appendChild(tr);
    });
}

function renderDueTodayReport() {
    const mock = [
        { ref: 'AC-L-8925', borrower: 'CHAN THEARY', inst: 2, due: '2026-06-26', amount: 395, status: 'Due' },
        { ref: 'AC-L-8927', borrower: 'SOK DARA', inst: 1, due: '2026-06-26', amount: 320, status: 'Due' },
        { ref: 'AC-L-8930', borrower: 'VONG PISEY', inst: 4, due: '2026-06-26', amount: 615, status: 'Due' },
        { ref: 'AC-L-8912', borrower: 'PHAL RATHA', inst: 9, due: '2026-06-24', amount: 480, status: 'Overdue' },
        { ref: 'AC-L-8908', borrower: 'KIM SREYLEAK', inst: 11, due: '2026-06-20', amount: 890, status: 'Overdue' },
        { ref: 'AC-L-8901', borrower: 'NOUN CHANTHY', inst: 14, due: '2026-06-15', amount: 1430, status: 'Overdue' },
    ];
    const body = document.getElementById('rpt-due-today-rows');
    body.innerHTML = '';
    mock.forEach(r => {
        const isDue = r.status === 'Due';
        const badge = isDue
            ? 'bg-amber-50 text-amber-700 border-amber-200/50'
            : 'bg-rose-50 text-rose-700 border-rose-200/50';
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/50 transition-colors';
        tr.innerHTML = `
            <td class="py-3.5 px-5 font-mono text-xs font-bold text-slate-500">${r.ref}</td>
            <td class="py-3.5 px-5 text-xs font-bold text-slate-800">${r.borrower}</td>
            <td class="py-3.5 px-5 text-center font-mono text-xs text-slate-600">#${r.inst}</td>
            <td class="py-3.5 px-5 font-mono text-xs text-slate-500">${r.due}</td>
            <td class="py-3.5 px-5 text-right font-mono text-xs font-bold text-slate-700">${formatVal(r.amount)}</td>
            <td class="py-3.5 px-5 text-center">
                <span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold border ${badge}">${r.status}</span>
            </td>`;
        body.appendChild(tr);
    });
}

function renderWriteOffReport() {
    const mock = [
        { ref: 'AC-L-8812', borrower: 'MEAS SOKHA', date: '2026-03-10', original: 4500, writeoff: 4500, recovery: 900, net: 3600 },
        { ref: 'AC-L-8756', borrower: 'TOUCH VIBOL', date: '2026-02-14', original: 2800, writeoff: 2800, recovery: 560, net: 2240 },
        { ref: 'AC-L-8703', borrower: 'CHHIM BUNNA', date: '2026-01-28', original: 6000, writeoff: 6000, recovery: 1200, net: 4800 },
        { ref: 'AC-L-8650', borrower: 'ROS MAKARA', date: '2025-12-05', original: 3200, writeoff: 3200, recovery: 640, net: 2560 },
        { ref: 'AC-L-8611', borrower: 'KHORN SOPHY', date: '2025-11-18', original: 5500, writeoff: 5500, recovery: 1100, net: 4400 },
        { ref: 'AC-L-8589', borrower: 'OUNG SREYPICH', date: '2025-10-30', original: 2200, writeoff: 2200, recovery: 440, net: 1760 },
    ];
    const body = document.getElementById('rpt-writeoff-rows');
    body.innerHTML = '';
    mock.forEach(r => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/50 transition-colors';
        tr.innerHTML = `
            <td class="py-3.5 px-5 font-mono text-xs font-bold text-slate-500">${r.ref}</td>
            <td class="py-3.5 px-5 text-xs font-bold text-slate-800">${r.borrower}</td>
            <td class="py-3.5 px-5 font-mono text-xs text-slate-500">${r.date}</td>
            <td class="py-3.5 px-5 text-right font-mono text-xs font-semibold text-slate-700">${formatVal(r.original)}</td>
            <td class="py-3.5 px-5 text-right font-mono text-xs font-bold text-rose-600">${formatVal(r.writeoff)}</td>
            <td class="py-3.5 px-5 text-right font-mono text-xs font-bold text-emerald-600">${formatVal(r.recovery)}</td>
            <td class="py-3.5 px-5 text-right font-mono text-xs font-bold text-slate-700">${formatVal(r.net)}</td>`;
        body.appendChild(tr);
    });
}

function buildLivePARData() {
    const base = state.parReport.map(row => ({ ...row }));
    if (state.activeLoan && (state.activeLoan.status === 'Disbursed' || state.activeLoan.status === 'Approved')) {
        const outstanding = state.activeLoan.schedule
            ? state.activeLoan.schedule.filter(s => s.status !== 'Paid').reduce((sum, s) => sum + (s.balance || 0), 0)
            : (state.activeLoan.amount || 0);
        base[0].accounts += 1;
        base[0].outstanding += outstanding;
    }
    return base;
}

function renderPARReport(customData = null) {
    const body = document.getElementById('par-report-rows');
    body.innerHTML = '';

    const data = customData || buildLivePARData();

    data.forEach(row => {
        const parPercentage = ((row.arrears / row.outstanding) * 100) || 0;
        let classBadge = "bg-slate-150 text-slate-700";
        if (row.class === 'Normal') classBadge = "bg-emerald-50 text-emerald-700 border border-emerald-200/50";
        else if (row.class === 'Special Mention') classBadge = "bg-blue-50 text-blue-700 border border-blue-200/50";
        else if (row.class === 'Sub-Standard') classBadge = "bg-amber-50 text-amber-700 border border-amber-200/50";
        else if (row.class === 'Doubtful') classBadge = "bg-orange-50 text-orange-700 border border-orange-200/50";
        else if (row.class === 'Loss / Write-off') classBadge = "bg-rose-50 text-rose-700 border border-rose-200/50";

        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50/50 transition-colors";
        tr.innerHTML = `
            <td class="py-3 px-6 font-bold text-slate-800">${row.bucket}</td>
            <td class="py-3 px-6 text-center font-mono font-semibold">${row.accounts}</td>
            <td class="py-3 px-6 text-right font-mono font-semibold">${formatVal(row.outstanding)}</td>
            <td class="py-3 px-6 text-right font-mono text-rose-600 font-bold">${formatVal(row.arrears)}</td>
            <td class="py-3 px-6 text-center font-mono">
                <span class="px-2 py-0.5 rounded-md bg-slate-100 font-bold text-xs">
                    ${parPercentage.toFixed(2)}%
                </span>
            </td>
            <td class="py-3 px-6">
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${classBadge}">
                    ${row.class}
                </span>
            </td>
            <td class="py-3 px-6 text-right font-mono text-slate-500 font-bold">${(row.rate * 100).toFixed(0)}%</td>
        `;
        body.appendChild(tr);
    });
}

function runReportFilterSimulation() {
    const branch = document.getElementById('rpt-filter-branch').value;
    const product = document.getElementById('rpt-filter-product').value;
    const date = document.getElementById('rpt-filter-date').value;

    showToast(`Filtering report data for branch: '${branch}' and product: '${product}'`, 'info');

    // Setup simulated modifications to table values to look dynamic
    let seedModifier = 1.0;
    if (branch === 'Siem Reap Branch') seedModifier = 0.65;
    else if (branch === 'Battambang Branch') seedModifier = 0.45;
    else if (branch === 'Phnom Penh Branch') seedModifier = 0.90;

    if (product !== 'All Products') seedModifier *= 0.35;

    const modifiedReport = state.parReport.map(row => {
        return {
            ...row,
            accounts: Math.max(1, Math.round(row.accounts * seedModifier)),
            outstanding: Math.max(100, Math.round(row.outstanding * seedModifier)),
            arrears: Math.round(row.arrears * seedModifier * 0.9)
        };
    });

    // Recalculate KPIs
    let newActivePortfolio = modifiedReport.reduce((acc, curr) => acc + curr.outstanding, 0);
    let newArrears = modifiedReport.reduce((acc, curr) => acc + curr.arrears, 0);
    let newDueToday = Math.round(newActivePortfolio * 0.0025);

    document.getElementById('rpt-active-portfolio').innerText = formatVal(newActivePortfolio);
    document.getElementById('rpt-active-portfolio-2').innerText = formatVal(newActivePortfolio);
    document.getElementById('rpt-due-today').innerText = formatVal(newDueToday);
    document.getElementById('rpt-arrears-balance').innerText = formatVal(newArrears);

    const newParRate = ((newArrears / newActivePortfolio) * 100) || 0;
    document.getElementById('rpt-par-rate').innerText = newParRate.toFixed(2);

    renderPARReport(modifiedReport);
}

// --- 10. SYSTEM SETTINGS & GRANULAR PERMISSIONS ---
const permissionNames = {
    'add_borrower': 'Add & Register Borrowers',
    'disburse_loan': 'Disburse & Authorize Loans',
    'write_off': 'Write-off Delinquent Accounts',
    'run_operations': 'Perform EOD & EOM Operations',
    'view_accounting': 'Inspect Financial Ledger Statements'
};

function loadRolePermissions() {
    const role = document.getElementById('settings-role-selector').value;
    state.selectedRole = role;

    const container = document.getElementById('permissions-container');
    container.innerHTML = '';

    const permissions = state.roleMatrix[role];

    for (const [key, val] of Object.entries(permissions)) {
        const label = permissionNames[key];
        const div = document.createElement('div');
        div.className = "flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200/50 rounded-xl hover:bg-slate-100/50 transition-all duration-150";
        div.innerHTML = `
            <span class="text-xs font-semibold text-slate-800">${label}</span>
            <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" id="perm-chk-${key}" ${val ? 'checked' : ''} 
                       class="sr-only peer" onchange="toggleMatrixInMemory('${key}', this)">
                <div class="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-350 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
            </label>
        `;
        container.appendChild(div);
    }
}

function toggleMatrixInMemory(permKey, checkbox) {
    const role = state.selectedRole;
    state.roleMatrix[role][permKey] = checkbox.checked;
}

function saveRolePermissionsConfig() {
    showToast(`Role Matrix for '${state.selectedRole}' updated successfully in Core Registry.`, 'success');
    renderRolesList();
}

function saveCompanyProfile() {
    const name = document.getElementById('company-name')?.value?.trim();
    const branch = document.getElementById('company-branch')?.value?.trim();
    if (!name) {
        showToast("Company name is required.", "error");
        return;
    }
    showToast(`Company Profile saved: ${name}${branch ? ` (${branch})` : ''}`, "success");
}

function saveLoanProductConfig() {
    const code = document.getElementById('loan-product-code')?.value?.trim();
    const name = document.getElementById('loan-product-name')?.value?.trim();
    const rate = parseFloat(document.getElementById('loan-product-rate')?.value) || 0;
    if (!code || !name || rate <= 0) {
        showToast("Please provide valid Product Code, Name, and Interest Rate.", "error");
        return;
    }
    showToast(`Loan Product saved: ${code} - ${name} (${rate.toFixed(2)}% p.a.)`, "success");
}

function saveApprovalLine() {
    const lineName = document.getElementById('approval-line-name')?.value?.trim();
    const level1 = document.getElementById('approval-level-1')?.value?.trim();
    const level2 = document.getElementById('approval-level-2')?.value?.trim();
    const level3 = document.getElementById('approval-level-3')?.value?.trim();

    if (!lineName || !level1) {
        showToast("Approval Line Name and Level 1 Approver are required.", "error");
        return;
    }

    const levels = [level1, level2, level3].filter(Boolean).join(" → ");
    showToast(`Approval Line saved: ${lineName} (${levels})`, "success");
}

// --- 11. PERIODIC BATCH RUNNER (EOD / EOM SIMULATION) ---
function runBatchSimulation(type) {
    // Check EOD run permission for Credit Manager
    if (!state.roleMatrix[state.selectedRole]['run_operations']) {
        showToast(`Action Denied: Role '${state.selectedRole}' does not hold 'run_operations' authority.`, 'error');
        return;
    }

    const activeLabel = document.getElementById('batch-active-label');
    const percentLabel = document.getElementById('batch-percentage');
    const bar = document.getElementById('batch-progress-bar');
    const container = document.getElementById('batch-progress-container');
    const terminal = document.getElementById('batch-terminal-logs');

    const btnEod = document.getElementById('btn-run-eod');
    const btnEom = document.getElementById('btn-run-eom');

    // Disable buttons
    btnEod.disabled = true;
    btnEom.disabled = true;
    btnEod.classList.add('opacity-50', 'cursor-not-allowed');
    btnEom.classList.add('opacity-50', 'cursor-not-allowed');

    container.classList.remove('hidden');
    terminal.innerHTML = `<span class="text-yellow-400 font-bold">[!] Initializing ${type} Batch Process Suite...</span>`;

    activeLabel.innerHTML = `<i data-lucide="loader" class="w-4 h-4 text-amber-500 animate-spin"></i> Running ${type}...`;
    lucide.createIcons();

    let logs = [];
    if (type === 'EOD') {
        logs = [
            "Checking connection with Central Bank Clearinghouse...",
            "Scanning 1,420 outstanding borrower accounts...",
            "Calculating daily interest accrual matrix ($1,420.25 accrued)...",
            "Applying principal balance deductions for repayments...",
            "Checking compliance rule violations (PAR classifications)...",
            "Aging delinquency buckets (3 accounts moved to 31-60 PAR)...",
            "Generating financial sub-ledgers accounts reconcile...",
            "Running trial balance verification... EQUATION EQUAL.",
            "End-of-Day batch processing complete. Lock status active."
        ];
    } else {
        logs = [
            "Initializing End-of-Month (EOM) batch reconcile...",
            "Computing monthly staff commission credits...",
            "Accruing regulatory reserve provisions (Net provision update)...",
            "Generating consolidated financial accounting worksheets...",
            "Posting general ledger statements to regulatory audit log...",
            "Generating Portfolio-at-Risk aging report for Cambodia HQ...",
            "Backing up system database clusters to secure cloud storage...",
            "End-of-Month process completed. Accounts closed for audit."
        ];
    }

    let step = 0;
    const stepInterval = 600; // ms per log line

    const timer = setInterval(() => {
        step++;
        const progress = Math.min(100, Math.round((step / logs.length) * 100));
        
        percentLabel.innerText = `${progress}%`;
        bar.style.width = `${progress}%`;

        // Add log text to terminal
        const line = document.createElement('div');
        line.className = "text-emerald-400 font-mono";
        line.innerHTML = `<span class="text-slate-500 font-bold">${new Date().toLocaleTimeString()} &gt;</span> ${logs[step - 1]}`;
        terminal.appendChild(line);
        terminal.scrollTop = terminal.scrollHeight; // Auto-scroll to bottom

        if (step >= logs.length) {
            clearInterval(timer);
            // Success state
            activeLabel.innerHTML = `<i data-lucide="check-circle" class="w-4 h-4 text-emerald-500"></i> ${type} Finished`;
            lucide.createIcons();
            
            showToast(`${type} Process completed successfully. Check logs.`, 'success');
            
            // Re-enable buttons
            btnEod.disabled = false;
            btnEom.disabled = false;
            btnEod.classList.remove('opacity-50', 'cursor-not-allowed');
            btnEom.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }, stepInterval);
}

// --- 12. NOTIFICATION PANEL ---
function toggleNotifications() {
    const panel = document.getElementById('notifications-panel');
    panel.classList.toggle('hidden');
}

function renderNotifications() {
    const list = document.getElementById('notifications-list');
    list.innerHTML = '';

    state.notifications.forEach(n => {
        const div = document.createElement('div');
        div.className = `p-3 rounded-xl border transition-all duration-150 cursor-pointer ${n.read ? 'bg-slate-50/50 border-slate-100 text-slate-500' : 'bg-brand-50/30 border-brand-100/50 hover:bg-brand-50/50'}`;
        div.onclick = () => markAsRead(n.id);
        div.innerHTML = `
            <div class="flex justify-between items-start gap-1">
                <h6 class="text-xs font-bold text-slate-800 ${n.read ? 'text-slate-500' : ''}">${n.title}</h6>
                <span class="text-[9px] text-slate-400 font-mono whitespace-nowrap">${n.time}</span>
            </div>
            <p class="text-[10px] text-slate-500 mt-1 leading-relaxed">${n.text}</p>
        `;
        list.appendChild(div);
    });
}

function markAsRead(id) {
    const idx = state.notifications.findIndex(n => n.id === id);
    if (idx !== -1) {
        state.notifications[idx].read = true;
        renderNotifications();
        showToast("Notification marked as read.", "info");
    }
}

function clearNotifications() {
    state.notifications.forEach(n => n.read = true);
    renderNotifications();
    showToast("All notifications marked as read.", "success");
}

// --- 13. GLOBAL SEARCH MECHANISM ---
function handleGlobalSearch(event) {
    state.borrowerPage = 1;
    const val = event.target.value.toUpperCase();
    
    // If ESC key is pressed, clear the search
    if (event.key === 'Escape') {
        event.target.value = '';
        renderBorrowersTable();
        return;
    }

    if (!val) {
        renderBorrowersTable();
        return;
    }

    // Filter borrowers by code, names, idNo, phone
    const matches = state.borrowers.filter(b => {
        return b.code.toUpperCase().includes(val) || 
               b.enName.toUpperCase().includes(val) || 
               (b.khName && b.khName.includes(val)) ||
               b.idNo.toUpperCase().includes(val) ||
               b.phone.includes(val);
    });

    // If we are not currently on borrowers tab, maybe switch to it to show results
    if (state.activeTab !== 'borrowers') {
        switchTab('borrowers');
    }

    renderBorrowersTable(matches);
}

// --- 14. TOAST NOTIFICATION UTILITY ---
function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    
    let typeColor = "border-slate-200 bg-white text-slate-700";
    let icon = "info";

    if (type === 'success') {
        typeColor = "border-emerald-200 bg-emerald-50 text-emerald-800";
        icon = "check-circle";
    } else if (type === 'error') {
        typeColor = "border-rose-200 bg-rose-50 text-rose-800";
        icon = "alert-circle";
    } else if (type === 'info') {
        typeColor = "border-sky-200 bg-sky-50 text-sky-800";
        icon = "info";
    } else if (type === 'warning') {
        typeColor = "border-amber-200 bg-amber-50 text-amber-800";
        icon = "alert-triangle";
    }

    toast.className = `p-3.5 border rounded-2xl shadow-xl flex items-center gap-3 text-xs font-bold fade-in transition-all duration-300 ${typeColor}`;
    toast.innerHTML = `
        <i data-lucide="${icon}" class="w-5 h-5 flex-shrink-0"></i>
        <span class="flex-1">${msg}</span>
    `;

    container.appendChild(toast);
    lucide.createIcons();

    // Slide out after 3 seconds
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

// --- 15. DASHBOARD ---
function renderDashboard() {
    const totalBorrowers = state.borrowers.length;
    const activeBorrowers = state.borrowers.filter(b => b.status === 'Active').length;
    const pendingBorrowers = state.borrowers.filter(b => b.status === 'Pending').length;
    const totalIncome = state.incomes.reduce((s, e) => s + e.amount, 0);
    const totalExpenses = state.expenses.reduce((s, e) => s + e.amount, 0);
    const netProfit = totalIncome - totalExpenses;

    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('dash-total-borrowers', totalBorrowers);
    setEl('dash-active-borrowers', activeBorrowers);
    setEl('dash-pending-borrowers', pendingBorrowers);
    setEl('dash-total-income', formatVal(totalIncome));
    setEl('dash-total-expenses', formatVal(totalExpenses));
    setEl('dash-net-profit', formatVal(netProfit));

    const activeLoanEl = document.getElementById('dash-active-loan');
    if (activeLoanEl) {
        if (state.activeLoan) {
            activeLoanEl.innerHTML = `<span class="font-bold text-brand-700">${state.activeLoan.ref}</span> — ${formatVal(state.activeLoan.amount)} <span class="text-xs text-slate-500">(${state.activeLoan.status || 'In Progress'})</span>`;
        } else {
            activeLoanEl.textContent = 'No active loan in session';
        }
    }

    const recentBorrowersEl = document.getElementById('dash-recent-borrowers');
    if (recentBorrowersEl) {
        const recent = state.borrowers.slice(0, 5);
        recentBorrowersEl.innerHTML = recent.length ? recent.map(b => {
            let badgeClass = 'bg-slate-100 text-slate-600 border-slate-200';
            if (b.status === 'Active') badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
            else if (b.status === 'Approved') badgeClass = 'bg-brand-50 text-brand-700 border-brand-200';
            else if (b.status === 'Pending') badgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
            return `<div class="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer" onclick="openBorrowerPreview('${b.code}')">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-xs flex-shrink-0">${b.enName.charAt(0)}</div>
                    <div>
                        <p class="text-xs font-bold text-slate-800">${b.enName}</p>
                        <p class="text-[10px] text-slate-500 font-mono">${b.code}</p>
                    </div>
                </div>
                <span class="px-2 py-0.5 rounded-md text-[10px] font-bold border ${badgeClass}">${b.status}</span>
            </div>`;
        }).join('') : '<p class="text-sm text-slate-400 text-center py-6">No borrowers registered yet.</p>';
    }

    const allTx = [
        ...state.incomes.map(i => ({ ...i, type: 'Income' })),
        ...state.expenses.map(e => ({ ...e, type: 'Expense' }))
    ].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 6);

    const recentTxEl = document.getElementById('dash-recent-transactions');
    if (recentTxEl) {
        recentTxEl.innerHTML = allTx.length ? allTx.map(t => {
            const isIncome = t.type === 'Income';
            return `<div class="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition-colors">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg ${isIncome ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'} flex items-center justify-center flex-shrink-0">
                        <i data-lucide="${isIncome ? 'trending-up' : 'trending-down'}" class="w-3.5 h-3.5"></i>
                    </div>
                    <div>
                        <p class="text-xs font-bold text-slate-800">${t.category}</p>
                        <p class="text-[10px] text-slate-400 font-mono">${t.code} · ${t.date}</p>
                    </div>
                </div>
                <span class="text-xs font-bold ${isIncome ? 'text-emerald-600' : 'text-rose-600'}">${isIncome ? '+' : '-'}${formatVal(t.amount)}</span>
            </div>`;
        }).join('') : '<p class="text-sm text-slate-400 text-center py-6">No transactions recorded yet.</p>';
        lucide.createIcons();
    }
}
