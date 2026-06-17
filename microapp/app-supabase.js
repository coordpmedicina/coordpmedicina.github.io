// MicroApp - Supabase Edition
// Global State
let formData = {
    identification: {},
    teachers: [],
    presentation: {},
    competencies: {},
    methodology: [],
    schedule: [],
    evaluation: {}
};

let currentMicrocurriculumId = null;
let currentVersionId = null;
let versions = [];
let supabaseReady = false;

// Initialize
document.addEventListener('DOMContentLoaded', async function() {
    // Test Supabase connection
    const connected = await testSupabaseConnection();
    updateSyncStatus(connected);
    supabaseReady = connected;

    initializeTabs();
    await loadMicrocurriculums();
    await populateSubjectDropdown();
    await loadCompetenciesStructure();
    loadLocalStorage();
    updateStats();

    // Setup prerequisites dropdown toggle
    const prereqToggle = document.getElementById('prerequisitesToggle');
    if (prereqToggle) {
        prereqToggle.addEventListener('click', togglePrerequisitesDropdown);
    }

    // Close dropdowns when clicking outside
    document.addEventListener('click', function(event) {
        // Prerequisites dropdown
        const prereqContainer = document.getElementById('prerequisitesContainer');
        const prereqToggle = document.getElementById('prerequisitesToggle');
        if (prereqContainer && prereqToggle) {
            const isClickInsideContainer = prereqContainer.contains(event.target);
            const isClickOnButton = prereqToggle.contains(event.target);
            if (!isClickInsideContainer && !isClickOnButton) {
                prereqContainer.style.display = 'none';
            }
        }

        // Competencia custom dropdown
        const compDropdown = document.getElementById('compCompetenciaDropdown');
        const compToggle = document.getElementById('compCompetenciaToggle');
        if (compDropdown && compToggle) {
            const isClickInsideDropdown = compDropdown.contains(event.target);
            const isClickOnButton = compToggle.contains(event.target);
            if (!isClickInsideDropdown && !isClickOnButton) {
                compDropdown.style.display = 'none';
            }
        }
    });
});

// Supabase Connection Status
async function testSupabaseConnection() {
    try {
        const { error } = await supabase.from('microcurriculum_versions').select('count()', { count: 'exact' }).limit(1);
        if (error && error.code !== 'PGRST116') throw error;
        return true;
    } catch (error) {
        console.error('Supabase error:', error);
        return false;
    }
}

function updateSyncStatus(connected) {
    const dot = document.getElementById('syncDot');
    const text = document.getElementById('syncText');

    if (connected) {
        dot.className = 'sync-dot ok';
        text.textContent = 'Conectado a Supabase';
    } else {
        dot.className = 'sync-dot err';
        text.textContent = 'Usando almacenamiento local';
    }
}

// Load Microcurriculums from Supabase
async function loadMicrocurriculums() {
    if (!supabaseReady) return;

    try {
        const { data, error } = await supabase
            .from('microcurriculums')
            .select(`id, subject_name, subject_code, created_at, microcurriculum_versions(*)`)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (data && data.length > 0) {
            renderMicrocurriculumsPanel(data);
        }
    } catch (error) {
        console.error('Error loading microcurriculums:', error);
        showAlert('Error al cargar microcurrículos', 'error');
    }
}

function renderMicrocurriculumsPanel(microcurriculums) {
    const container = document.getElementById('versionsContainer');
    const noMsg = document.getElementById('noVersionsMsg');

    if (microcurriculums.length === 0) {
        noMsg.style.display = 'block';
        container.innerHTML = '';
        return;
    }

    noMsg.style.display = 'none';
    container.innerHTML = microcurriculums.map(mc => {
        const latestVersion = mc.microcurriculum_versions?.[0];
        return `
            <div class="version-card ${currentVersionId === latestVersion?.id ? 'active' : ''}"
                 onclick="selectVersion('${mc.id}', '${latestVersion?.id}')">
                <div class="version-card-title">${mc.subject_name}</div>
                <div class="version-card-date">${mc.subject_code}</div>
                ${latestVersion ? `
                    <span class="version-card-status ${latestVersion.status}">
                        ${latestVersion.status === 'draft' ? '📝 Borrador' :
                          latestVersion.status === 'active' ? '✅ Activo' : '📦 Archivado'}
                    </span>
                ` : ''}
            </div>
        `;
    }).join('');
}

// Select Version
async function selectVersion(microcurriculumId, versionId) {
    currentMicrocurriculumId = microcurriculumId;
    currentVersionId = versionId;

    if (supabaseReady && versionId) {
        try {
            const { data, error } = await supabase
                .from('microcurriculum_versions')
                .select('data')
                .eq('id', versionId)
                .single();

            if (error) throw error;

            if (data?.data) {
                formData = data.data;
                loadFormFromData();
                showAlert('Versión cargada correctamente', 'success');
                updateStats();
            }
        } catch (error) {
            console.error('Error loading version:', error);
            showAlert('Error al cargar versión', 'error');
        }
    } else {
        showAlert('Selecciona una versión válida', 'warning');
    }
}

// Show New Version Dialog
function showNewVersionDialog() {
    const dialog = document.getElementById('versionDialog');
    dialog.style.display = 'flex';
    document.getElementById('versionName').value = '';
    document.getElementById('versionNotes').value = '';
}

function closeVersionDialog() {
    document.getElementById('versionDialog').style.display = 'none';
}

// Create New Version
async function createNewVersion() {
    const versionName = document.getElementById('versionName').value.trim();

    if (!versionName) {
        showAlert('Por favor ingresa un nombre para la versión', 'error');
        return;
    }

    if (!supabaseReady) {
        showAlert('No hay conexión a Supabase. Usa almacenamiento local.', 'warning');
        saveLocalStorage();
        return;
    }

    collectFormData();

    try {
        const versionNotes = document.getElementById('versionNotes').value.trim();

        // Get next version number
        const { data: versions, error: versionError } = await supabase
            .from('microcurriculum_versions')
            .select('version_number')
            .eq('microcurriculum_id', currentMicrocurriculumId)
            .order('version_number', { ascending: false })
            .limit(1);

        const nextVersion = (versions?.[0]?.version_number || 0) + 1;

        // Create version
        const { data: newVersion, error } = await supabase
            .from('microcurriculum_versions')
            .insert({
                microcurriculum_id: currentMicrocurriculumId,
                version_number: nextVersion,
                version_name: versionName,
                data: formData,
                status: 'draft',
                created_by: 'anonymous',
                notes: versionNotes
            })
            .select()
            .single();

        if (error) throw error;

        currentVersionId = newVersion.id;
        closeVersionDialog();
        await loadMicrocurriculums();
        showAlert(`Versión ${nextVersion} creada correctamente`, 'success');
    } catch (error) {
        console.error('Error creating version:', error);
        showAlert('Error al crear versión', 'error');
    }
}

// Save to Supabase
async function saveToSupabase() {
    if (!supabaseReady || !currentVersionId) {
        showAlert('No hay conexión a Supabase', 'warning');
        saveLocalStorage();
        return;
    }

    collectFormData();

    try {
        const { error } = await supabase
            .from('microcurriculum_versions')
            .update({
                data: formData,
                updated_at: new Date().toISOString()
            })
            .eq('id', currentVersionId);

        if (error) throw error;

        showAlert('Cambios guardados en Supabase', 'success');
    } catch (error) {
        console.error('Error saving to Supabase:', error);
        showAlert('Error al guardar', 'error');
    }
}

// ===== REST OF THE ORIGINAL CODE =====

// Tab Navigation
function initializeTabs() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            switchTab(this.dataset.tab);
        });
    });
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.nav-tab').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(tabName).classList.add('active');
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    updateStats();
}

// Alert System
function showAlert(message, type = 'success') {
    const alertDiv = document.getElementById('alert');
    alertDiv.textContent = message;
    alertDiv.className = `alert alert-${type} show`;
    setTimeout(() => alertDiv.classList.remove('show'), 4000);
}

// Teachers Management
function addTeacher() {
    const name = document.getElementById('teacherName').value.trim();
    const email = document.getElementById('teacherEmail').value.trim();
    const area = document.getElementById('teacherArea').value.trim();

    if (!name || !email || !area) {
        showAlert('Completa todos los campos del docente', 'error');
        return;
    }

    formData.teachers.push({ name, email, area, id: Date.now() });
    document.getElementById('teacherName').value = '';
    document.getElementById('teacherEmail').value = '';
    document.getElementById('teacherArea').value = '';
    renderTeachers();
    showAlert('Docente agregado', 'success');
    updateStats();
}

function renderTeachers() {
    const container = document.getElementById('teachersContainer');
    const list = document.getElementById('teachersList');

    if (formData.teachers.length === 0) {
        list.style.display = 'none';
        return;
    }

    list.style.display = 'block';
    container.innerHTML = formData.teachers.map(teacher => `
        <div class="item">
            <div>
                <strong>${teacher.name}</strong><br>
                <small>${teacher.email} | ${teacher.area}</small>
            </div>
            <button class="remove-btn" onclick="removeTeacher(${teacher.id})">Eliminar</button>
        </div>
    `).join('');
}

function removeTeacher(id) {
    formData.teachers = formData.teachers.filter(t => t.id !== id);
    renderTeachers();
    updateStats();
}

// Learning Outcomes
function addLearningOutcome() {
    const ra = document.getElementById('raInput').value.trim();
    if (!ra) {
        showAlert('Escribe un resultado de aprendizaje', 'error');
        return;
    }

    if (!formData.competencies.learningOutcomes) {
        formData.competencies.learningOutcomes = [];
    }

    formData.competencies.learningOutcomes.push({ text: ra, id: Date.now() });
    document.getElementById('raInput').value = '';
    renderLearningOutcomes();
    showAlert('RA agregado', 'success');
    updateStats();
}

function renderLearningOutcomes() {
    const outcomes = formData.competencies.learningOutcomes || [];
    const container = document.getElementById('raContainer');
    const list = document.getElementById('raList');

    if (outcomes.length === 0) {
        list.style.display = 'none';
        return;
    }

    list.style.display = 'block';
    container.innerHTML = outcomes.map((outcome, index) => `
        <div class="item">
            <div><strong>RA ${index + 1}:</strong> ${outcome.text}</div>
            <button class="remove-btn" onclick="removeLearningOutcome(${outcome.id})">Eliminar</button>
        </div>
    `).join('');
}

function removeLearningOutcome(id) {
    formData.competencies.learningOutcomes = formData.competencies.learningOutcomes.filter(ra => ra.id !== id);
    renderLearningOutcomes();
    updateStats();
}

// Topics
function addTopic() {
    const topic = document.getElementById('topicName').value.trim();
    const method = document.getElementById('teachingMethod').value;
    const present = document.getElementById('presentHours').value;
    const independent = document.getElementById('independentHours').value;
    const description = document.getElementById('methodDescription').value.trim();
    const resources = document.getElementById('resources').value.trim();
    const bibliography = document.getElementById('bibliography').value.trim();

    if (!topic || !method) {
        showAlert('Completa los campos requeridos', 'error');
        return;
    }

    formData.methodology.push({
        topic, method,
        presentHours: parseInt(present) || 0,
        independentHours: parseInt(independent) || 0,
        description, resources, bibliography,
        id: Date.now()
    });

    document.getElementById('topicName').value = '';
    document.getElementById('teachingMethod').value = '';
    document.getElementById('presentHours').value = '';
    document.getElementById('independentHours').value = '';
    document.getElementById('methodDescription').value = '';
    document.getElementById('resources').value = '';
    document.getElementById('bibliography').value = '';

    renderTopics();
    showAlert('Tema agregado', 'success');
    updateStats();
}

function renderTopics() {
    const container = document.getElementById('topicsContainer');
    const list = document.getElementById('topicsList');

    if (formData.methodology.length === 0) {
        list.style.display = 'none';
        return;
    }

    list.style.display = 'block';
    container.innerHTML = formData.methodology.map((topic, index) => `
        <div class="item">
            <div>
                <strong>Tema ${index + 1}: ${topic.topic}</strong><br>
                <small>${topic.method} | ${topic.presentHours}h + ${topic.independentHours}h</small>
            </div>
            <button class="remove-btn" onclick="removeTopic(${topic.id})">Eliminar</button>
        </div>
    `).join('');
}

function removeTopic(id) {
    formData.methodology = formData.methodology.filter(t => t.id !== id);
    renderTopics();
    updateStats();
}

// Schedule
function addWeek() {
    const week = document.getElementById('weekNumber').value;
    const topic = document.getElementById('weekTopic').value.trim();
    const activities = document.getElementById('weekActivities').value.trim();
    const evaluation = document.getElementById('weekEvaluation').value.trim();
    const notes = document.getElementById('weekNotes').value.trim();

    if (!week || !topic) {
        showAlert('Completa semana y tema', 'error');
        return;
    }

    formData.schedule.push({ week: parseInt(week), topic, activities, evaluation, notes, id: Date.now() });

    document.getElementById('weekNumber').value = '';
    document.getElementById('weekTopic').value = '';
    document.getElementById('weekActivities').value = '';
    document.getElementById('weekEvaluation').value = '';
    document.getElementById('weekNotes').value = '';

    renderSchedule();
    showAlert('Semana agregada', 'success');
    updateStats();
}

function renderSchedule() {
    const container = document.getElementById('scheduleContainer');
    const list = document.getElementById('scheduleList');
    const sorted = [...formData.schedule].sort((a, b) => a.week - b.week);

    if (sorted.length === 0) {
        list.style.display = 'none';
        return;
    }

    list.style.display = 'block';
    container.innerHTML = sorted.map(week => `
        <div class="item">
            <div>
                <strong>Semana ${week.week}: ${week.topic}</strong><br>
                <small>${week.evaluation || 'Sin evaluación'}</small>
            </div>
            <button class="remove-btn" onclick="removeWeek(${week.id})">Eliminar</button>
        </div>
    `).join('');
}

function removeWeek(id) {
    formData.schedule = formData.schedule.filter(w => w.id !== id);
    renderSchedule();
    updateStats();
}

// Collect Form Data
function collectFormData() {
    // Collect selected prerequisites from checkboxes
    const prerequisitesContainer = document.getElementById('prerequisitesContainer');
    const selectedPrereqs = Array.from(prerequisitesContainer.querySelectorAll('input[type="checkbox"]:checked')).map(checkbox => checkbox.value);

    formData.identification = {
        subjectName: document.getElementById('subjectName').value,
        subjectCode: document.getElementById('subjectCode').value,
        semester: document.getElementById('semester').value,
        credits: document.getElementById('credits').value,
        hoursPerWeek: document.getElementById('hoursPerWeek').value,
        module: document.getElementById('module').value,
        area: document.getElementById('area').value,
        prerequisites: selectedPrereqs,
        coordinator: document.getElementById('coordinator').value,
        coordinatorEmail: document.getElementById('coordinatorEmail').value,
        coordinatorArea: document.getElementById('coordinatorArea').value,
    };

    formData.presentation = {
        departmentMission: document.getElementById('departmentMission').value,
        generalObjectives: document.getElementById('generalObjectives').value,
        specificObjectives: document.getElementById('specificObjectives').value,
        justification: document.getElementById('justification').value,
        generalDescription: document.getElementById('generalDescription').value,
        advisorySpaces: document.getElementById('advisorySpaces').value,
    };

    // Competencies matrix is already in formData.competencies

    formData.evaluation = {
        diagnostic: document.getElementById('diagnosticEvaluation').value,
        formative: document.getElementById('formativeEvaluation').value,
        firstExam: document.getElementById('firstExam').value,
        secondExam: document.getElementById('secondExam').value,
        finalExam: document.getElementById('finalExam').value,
        description: document.getElementById('evaluationDescription').value,
        criteria: document.getElementById('gradingCriteria').value,
    };
}

// Update Stats
function updateStats() {
    collectFormData();

    let totalFields = 0;
    let filledFields = 0;

    const identFields = ['subjectName', 'subjectCode', 'semester', 'credits', 'hoursPerWeek', 'module', 'area'];
    identFields.forEach(field => {
        totalFields++;
        const el = document.getElementById(field);
        if (el && el.value.trim()) filledFields++;
    });

    const presentFields = ['departmentMission', 'generalObjectives', 'specificObjectives', 'justification', 'generalDescription'];
    presentFields.forEach(field => {
        totalFields++;
        const el = document.getElementById(field);
        if (el && el.value.trim()) filledFields++;
    });

    // Check competencies matrix
    totalFields += 1;
    if (formData.competencies?.matrix && formData.competencies.matrix.length > 0) filledFields++;

    const evalFields = ['diagnosticEvaluation', 'formativeEvaluation', 'evaluationDescription'];
    evalFields.forEach(field => {
        totalFields++;
        if (document.getElementById(field).value.trim()) filledFields++;
    });

    const percentage = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;

    document.getElementById('completionPercentage').textContent = percentage + '%';
    document.getElementById('fieldCount').textContent = filledFields;
    document.getElementById('teachersCount').textContent = formData.teachers.length;

    if (document.getElementById('export').classList.contains('active')) {
        showValidation();
    }
}

// Validation
function showValidation() {
    collectFormData();
    const validations = [];

    if (!formData.identification.subjectName) validations.push({ text: 'Nombre de asignatura', status: 'invalid' });
    else validations.push({ text: 'Nombre de asignatura', status: 'valid' });

    if (!formData.identification.subjectCode) validations.push({ text: 'Código de asignatura', status: 'invalid' });
    else validations.push({ text: 'Código de asignatura', status: 'valid' });

    if (!formData.identification.semester) validations.push({ text: 'Semestre', status: 'invalid' });
    else validations.push({ text: 'Semestre', status: 'valid' });

    if (!formData.identification.module) validations.push({ text: 'Módulo del programa', status: 'invalid' });
    else validations.push({ text: 'Módulo del programa', status: 'valid' });

    if (formData.teachers.length === 0 && !formData.identification.coordinator) {
        validations.push({ text: 'Al menos un docente', status: 'invalid' });
    } else {
        validations.push({ text: 'Docentes asignados', status: 'valid' });
    }

    const hasCompetencies = formData.competencies.ser || formData.competencies.saber ||
                            formData.competencies.hacer || formData.competencies.comunicar;
    if (!hasCompetencies) {
        validations.push({ text: 'Competencias en 4 dimensiones', status: 'invalid' });
    } else {
        validations.push({ text: 'Competencias en 4 dimensiones', status: 'valid' });
    }

    const raCount = formData.competencies.learningOutcomes?.length || 0;
    if (raCount < 3) {
        validations.push({ text: `Resultados de Aprendizaje (${raCount}/3 mínimo)`, status: 'warning' });
    } else {
        validations.push({ text: `Resultados de Aprendizaje (${raCount})`, status: 'valid' });
    }

    if (formData.methodology.length === 0) {
        validations.push({ text: 'Temas/Metodología', status: 'warning' });
    } else {
        validations.push({ text: `Temas/Metodología (${formData.methodology.length})`, status: 'valid' });
    }

    if (formData.schedule.length === 0) {
        validations.push({ text: 'Cronograma', status: 'warning' });
    } else {
        validations.push({ text: `Cronograma (${formData.schedule.length} semanas)`, status: 'valid' });
    }

    if (!formData.evaluation.diagnostic && !formData.evaluation.formative) {
        validations.push({ text: 'Evaluación diagnóstica y formativa', status: 'invalid' });
    } else {
        validations.push({ text: 'Evaluación diagnóstica y formativa', status: 'valid' });
    }

    const container = document.getElementById('validationContainer');
    container.innerHTML = `
        <h3 style="color: var(--c1); margin-bottom: 14px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.07em; font-weight: 700;">🔍 Validación del Microcurrículo</h3>
        <div class="validation-list">
            ${validations.map(v => `
                <div class="validation-item ${v.status}">
                    <span class="icon">${v.status === 'valid' ? '✓' : v.status === 'invalid' ? '✗' : '⚠'}</span>
                    ${v.text}
                </div>
            `).join('')}
        </div>
    `;
}

// Export Functions (keep from original)
function exportPDF() {
    collectFormData();

    if (!formData.identification.subjectName) {
        showAlert('Completa al menos el nombre de la asignatura', 'error');
        return;
    }

    const printWindow = window.open('', '', 'height=600,width=800');
    const doc = printWindow.document;

    doc.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Microcurrículo - ${formData.identification.subjectName}</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; margin: 20px; color: #333; }
                h1 { color: #1D5FA6; border-bottom: 3px solid #1D5FA6; padding-bottom: 10px; }
                h2 { color: #2478C5; margin-top: 25px; }
                h3 { color: #5a6e85; margin-top: 15px; }
                .header { text-align: center; margin-bottom: 30px; }
                .section { margin-bottom: 25px; }
                .info-box { background: #F4F7FA; padding: 15px; border-radius: 5px; margin: 10px 0; }
                table { width: 100%; border-collapse: collapse; margin: 10px 0; }
                th, td { border: 1px solid #dce6ef; padding: 10px; text-align: left; }
                th { background: #1D5FA6; color: white; }
                ol, ul { margin-left: 20px; }
                .page-break { page-break-after: always; }
                @media print { body { margin: 0; } }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>${formData.identification.subjectName}</h1>
                <p><strong>Código:</strong> ${formData.identification.subjectCode || 'N/A'}</p>
                <p><strong>Universidad del Cauca - Programa de Medicina</strong></p>
            </div>

            <div class="section">
                <h2>1. Identificación</h2>
                <div class="info-box">
                    <p><strong>Código:</strong> ${formData.identification.subjectCode || 'N/A'}</p>
                    <p><strong>Semestre:</strong> ${formData.identification.semester || 'N/A'}</p>
                    <p><strong>Créditos:</strong> ${formData.identification.credits || 'N/A'}</p>
                    <p><strong>Intensidad Horaria:</strong> ${formData.identification.hoursPerWeek || 'N/A'} horas/semana</p>
                    <p><strong>Módulo:</strong> ${formData.identification.module || 'N/A'}</p>
                </div>
            </div>

            <div class="section page-break">
                <h2>2. Competencias</h2>
                <div class="info-box">
                    <h3>Del SER</h3>
                    <p>${formData.competencies.ser || 'No definida'}</p>
                </div>
                <div class="info-box">
                    <h3>Del SABER</h3>
                    <p>${formData.competencies.saber || 'No definida'}</p>
                </div>
            </div>

            <script>
                window.print();
                setTimeout(() => window.close(), 1000);
            </script>
        </body>
        </html>
    `);

    doc.close();
    showAlert('PDF preparado', 'success');
}

function exportMarkdown() {
    collectFormData();

    if (!formData.identification.subjectName) {
        showAlert('Completa al menos el nombre', 'error');
        return;
    }

    let markdown = `# ${formData.identification.subjectName}\n\n**Universidad del Cauca**\n\n---\n\n## Identificación\n\n- **Código:** ${formData.identification.subjectCode || 'N/A'}\n- **Semestre:** ${formData.identification.semester || 'N/A'}\n- **Módulo:** ${formData.identification.module || 'N/A'}`;

    downloadFile(markdown, `${formData.identification.subjectName.replace(/\s+/g, '_')}.md`, 'text/markdown');
    showAlert('Markdown descargado', 'success');
}

function exportJSON() {
    collectFormData();
    if (!formData.identification.subjectName) {
        showAlert('Completa al menos el nombre', 'error');
        return;
    }

    const json = JSON.stringify(formData, null, 2);
    downloadFile(json, `${formData.identification.subjectName.replace(/\s+/g, '_')}.json`, 'application/json');
    showAlert('JSON guardado', 'success');
}

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

// LocalStorage
function saveLocalStorage() {
    collectFormData();
    localStorage.setItem('microculloData', JSON.stringify(formData));
    showAlert('Guardado en almacenamiento local', 'success');
}

function loadLocalStorage() {
    const saved = localStorage.getItem('microculloData');
    if (saved) {
        try {
            formData = JSON.parse(saved);
            loadFormFromData();
            updateStats();
        } catch (e) {
            showAlert('Error al cargar datos', 'error');
        }
    }
}

function loadFormFromData() {
    document.getElementById('subjectName').value = formData.identification?.subjectName || '';
    document.getElementById('subjectCode').value = formData.identification?.subjectCode || '';
    document.getElementById('semester').value = formData.identification?.semester || '';
    document.getElementById('credits').value = formData.identification?.credits || '';
    document.getElementById('hoursPerWeek').value = formData.identification?.hoursPerWeek || '';
    document.getElementById('module').value = formData.identification?.module || '';
    document.getElementById('area').value = formData.identification?.area || '';

    // Load prerequisites as array from checkboxes
    const prerequisitesContainer = document.getElementById('prerequisitesContainer');
    const prereqs = formData.identification?.prerequisites || [];
    const checkboxes = prerequisitesContainer.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = prereqs.includes(checkbox.value);
    });

    document.getElementById('coordinator').value = formData.identification?.coordinator || '';
    document.getElementById('coordinatorEmail').value = formData.identification?.coordinatorEmail || '';
    document.getElementById('coordinatorArea').value = formData.identification?.coordinatorArea || '';
    renderTeachers();

    document.getElementById('departmentMission').value = formData.presentation?.departmentMission || '';
    document.getElementById('generalObjectives').value = formData.presentation?.generalObjectives || '';
    document.getElementById('specificObjectives').value = formData.presentation?.specificObjectives || '';
    document.getElementById('justification').value = formData.presentation?.justification || '';
    document.getElementById('generalDescription').value = formData.presentation?.generalDescription || '';
    document.getElementById('advisorySpaces').value = formData.presentation?.advisorySpaces || '';

    // Load competencies matrix
    renderCompetenciesMatrix();

    document.getElementById('diagnosticEvaluation').value = formData.evaluation?.diagnostic || '';
    document.getElementById('formativeEvaluation').value = formData.evaluation?.formative || '';
    document.getElementById('firstExam').value = formData.evaluation?.firstExam || '35';
    document.getElementById('secondExam').value = formData.evaluation?.secondExam || '35';
    document.getElementById('finalExam').value = formData.evaluation?.finalExam || '30';
    document.getElementById('evaluationDescription').value = formData.evaluation?.description || '';
    document.getElementById('gradingCriteria').value = formData.evaluation?.criteria || '';

    renderTopics();
    renderSchedule();
}

function clearForm() {
    if (confirm('¿Seguro de limpiar todo?')) {
        formData = {
            identification: {},
            teachers: [],
            presentation: {},
            competencies: {},
            methodology: [],
            schedule: [],
            evaluation: {}
        };

        document.querySelectorAll('input[type="text"], input[type="email"], input[type="number"], textarea, select').forEach(field => {
            field.value = '';
        });

        renderTeachers();
        renderCompetenciesMatrix();
        renderTopics();
        renderSchedule();
        updateStats();
        showAlert('Formulario limpiado', 'success');
    }
}

// Load subjects from JSON and populate dropdowns
async function populateSubjectDropdown() {
    try {
        const response = await fetch('./subjects-updated.json');
        const data = await response.json();
        const subjects = data.subjects;

        // Populate main subject dropdown
        const subjectSelect = document.getElementById('subjectName');
        subjectSelect.innerHTML = '<option value="">Seleccionar una asignatura...</option>';

        // Populate prerequisites checkboxes
        const prerequisitesContainer = document.getElementById('prerequisitesContainer');
        prerequisitesContainer.innerHTML = '';

        subjects.forEach(subject => {
            // Main subject dropdown
            const option = document.createElement('option');
            option.value = subject.code;
            option.textContent = `${subject.code} - ${subject.name}`;
            option.dataset.subjectData = JSON.stringify(subject);
            subjectSelect.appendChild(option);

            // Prerequisites checkbox
            const checkboxLabel = document.createElement('label');
            checkboxLabel.style.cssText = 'display: flex; align-items: center; cursor: pointer; padding: 10px 12px; border-radius: 4px; transition: background 0.2s; border-bottom: 1px solid #f0f0f0;';
            checkboxLabel.onmouseover = function() { this.style.background = '#f5f9ff'; };
            checkboxLabel.onmouseout = function() { this.style.background = 'transparent'; };

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = subject.code;
            checkbox.id = `prereq_${subject.code}`;
            checkbox.style.cssText = 'margin-right: 8px; cursor: pointer; accent-color: #1D5FA6; flex-shrink: 0;';
            checkbox.addEventListener('change', updatePrerequisitesDisplay);

            const labelText = document.createElement('span');
            labelText.textContent = subject.name;
            labelText.style.cssText = 'font-size: 11px; color: #333; line-height: 1.3;';

            checkboxLabel.appendChild(checkbox);
            checkboxLabel.appendChild(labelText);
            prerequisitesContainer.appendChild(checkboxLabel);
        });
    } catch (error) {
        console.error('Error loading subjects:', error);
        showAlert('Error al cargar las asignaturas', 'error');
    }
}

// Toggle prerequisites dropdown
function togglePrerequisitesDropdown(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('prerequisitesContainer');
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
}

// Update prerequisites display text
function updatePrerequisitesDisplay() {
    const checkboxes = document.querySelectorAll('#prerequisitesContainer input[type="checkbox"]:checked');
    const display = document.getElementById('prerequisitesDisplay');

    if (checkboxes.length === 0) {
        display.textContent = 'Selecciona prerrequisitos...';
        display.style.color = '#5a6e85';
    } else if (checkboxes.length === 1) {
        display.textContent = checkboxes[0].nextElementSibling.textContent;
        display.style.color = '#1a2535';
    } else {
        display.textContent = `${checkboxes.length} asignaturas seleccionadas`;
        display.style.color = '#1a2535';
    }
}

// Load subject details when a subject is selected
function loadSubjectDetails() {
    const subjectSelect = document.getElementById('subjectName');
    const selectedOption = subjectSelect.options[subjectSelect.selectedIndex];

    if (!selectedOption.value) {
        return;
    }

    try {
        const subject = JSON.parse(selectedOption.dataset.subjectData);

        // Populate identification section with protected fields
        document.getElementById('subjectCode').value = subject.code;
        document.getElementById('subjectCode').readOnly = true;

        document.getElementById('semester').value = subject.semester;
        document.getElementById('semester').readOnly = true;

        document.getElementById('credits').value = subject.credits;
        document.getElementById('credits').readOnly = true;

        document.getElementById('hoursPerWeek').value = subject.directTeachingHours;
        document.getElementById('hoursPerWeek').readOnly = true;

        // Update module button with gradient color
        document.getElementById('module').textContent = subject.component;
        document.getElementById('module').style.background = 'linear-gradient(135deg, #1D5FA6, #2478C5)';
        document.getElementById('module').style.color = 'white';

        document.getElementById('area').value = subject.component;
        document.getElementById('area').readOnly = true;

        // Update form data
        formData.identification = {
            subjectName: subject.name,
            subjectCode: subject.code,
            semester: subject.semester,
            credits: subject.credits,
            directTeachingHours: subject.directTeachingHours,
            component: subject.component,
            componentCode: subject.componentCode,
            protected: true
        };

        showAlert(`✅ Detalles de ${subject.code} cargados automáticamente (campos protegidos)`, 'success');
        updateStats();
    } catch (error) {
        console.error('Error loading subject details:', error);
        showAlert('Error al cargar detalles de la asignatura', 'error');
    }
}

// Load weekly schedule (malla semanal)
async function loadWeeklySchedule() {
    try {
        const response = await fetch('./plan_medicina_2026-06-17.json');
        const data = await response.json();

        // Store the malla schedule in formData
        if (data.mallaSchedule) {
            formData.schedule.mallaSchedule = data.mallaSchedule;
            formData.schedule.weeks = data.weeks;
            renderWeeklySchedule();
        }
    } catch (error) {
        console.error('Error loading weekly schedule:', error);
    }
}

// Render weekly schedule grid
function renderWeeklySchedule() {
    const schedule = formData.schedule.mallaSchedule;
    if (!schedule) return;

    const currentSemester = formData.identification?.semester || 1;
    const semesterSchedule = schedule[currentSemester];

    if (!semesterSchedule) {
        console.log('No schedule for semester', currentSemester);
        showAlert('No hay malla disponible para este semestre', 'warning');
        return;
    }

    let html = '<div class="malla-container">';
    html += '<table class="malla-table" style="width:100%; border-collapse:collapse; font-size:12px; background:white;">';
    html += '<tr style="background:#1D5FA6; color:white;"><th style="border:1px solid #ccc;padding:8px;font-weight:600;">Hora</th>';

    const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];
    days.forEach(day => {
        html += `<th style="border:1px solid #ccc;padding:8px;font-weight:600;">${day.charAt(0).toUpperCase() + day.slice(1)}</th>`;
    });
    html += '</tr>';

    // Generate rows for each hour (7 to 18)
    for (let hour = 7; hour <= 18; hour++) {
        html += `<tr><td style="border:1px solid #ccc;padding:8px;font-weight:bold;background:#f5f5f5;">${hour}:00</td>`;

        days.forEach(day => {
            const key = `${day}-${hour}`;
            const subjectIds = semesterSchedule[key] || [];
            const subjectInfo = subjectIds.length > 0 ? `[ID: ${subjectIds.join(', ')}]` : '';
            const bgColor = subjectIds.length > 0 ? '#e8f4f8' : '#ffffff';
            html += `<td style="border:1px solid #ddd;padding:8px; cursor:pointer;background:${bgColor};" title="Haz clic para editar" onclick="editScheduleCell('${day}', ${hour})">${subjectInfo}</td>`;
        });
        html += '</tr>';
    }

    html += '</table></div>';

    const mallaContainer = document.getElementById('mallaContainer');
    if (mallaContainer) {
        mallaContainer.innerHTML = html;
        showAlert('✅ Malla semanal cargada correctamente', 'success');
    }
}

// Edit schedule cell
function editScheduleCell(day, hour) {
    const currentSemester = formData.identification?.semester || 1;
    const key = `${day}-${hour}`;

    const newValue = prompt(`Ingresa los IDs de asignaturas separados por comas para ${day} ${hour}:00`);

    if (newValue !== null) {
        if (!formData.schedule.mallaSchedule) formData.schedule.mallaSchedule = {};
        if (!formData.schedule.mallaSchedule[currentSemester]) formData.schedule.mallaSchedule[currentSemester] = {};

        formData.schedule.mallaSchedule[currentSemester][key] = newValue.trim() ? newValue.split(',').map(id => parseInt(id.trim())) : [];
        renderWeeklySchedule();
        showAlert('Malla actualizada correctamente', 'success');
    }
}

// Competencies Matrix
function addCompetencyRow() {
    const modulo = document.getElementById('compModulo').value;
    const competencia = document.getElementById('compCompetencia').value;
    const ra = document.getElementById('compRA').value;
    const estrategiaMet = document.getElementById('compEstrategiaMet').value;
    const estrategiaEval = document.getElementById('compEstrategiaEval').value;
    const indicador = document.getElementById('compIndicador').value;

    if (!modulo || !competencia || !ra) {
        showAlert('Por favor completa Módulo, Competencia y Resultado de Aprendizaje', 'error');
        return;
    }

    if (!formData.competencies) formData.competencies = {};
    if (!formData.competencies.matrix) formData.competencies.matrix = [];

    const newRow = {
        id: Date.now(),
        modulo,
        competencia,
        ra,
        estrategiaMet,
        estrategiaEval,
        indicador
    };

    formData.competencies.matrix.push(newRow);
    renderCompetenciesMatrix();

    // Clear form
    document.getElementById('compModulo').value = '';
    document.getElementById('compCompetencia').value = '';
    document.getElementById('compRA').value = '';
    document.getElementById('compEstrategiaMet').value = '';
    document.getElementById('compEstrategiaEval').value = '';
    document.getElementById('compIndicador').value = '';

    showAlert('Competencia agregada correctamente', 'success');
    saveToLocalStorage();
}

function renderCompetenciesMatrix() {
    const tbody = document.getElementById('competenciesMatrixBody');
    const matrix = formData.competencies?.matrix || [];

    if (matrix.length === 0) {
        tbody.innerHTML = `<tr style="border-bottom: 1px solid #dce6ef; background: #f9fbfd;">
            <td colspan="6" style="padding: 40px 20px; text-align: center; color: #999;">
                No hay competencias agregadas. Usa el formulario a continuación para agregar.
            </td>
        </tr>`;
        return;
    }

    tbody.innerHTML = matrix.map(row => `
        <tr style="border-bottom: 1px solid #dce6ef; background: #fafbfc; transition: background 0.2s;">
            <td style="padding: 14px 14px; color: #1D5FA6; font-weight: 500; font-size: 13px; vertical-align: top;">${row.modulo}</td>
            <td style="padding: 14px 14px; font-size: 13px; color: #333; vertical-align: top;">${row.competencia}</td>
            <td style="padding: 14px 14px; font-size: 13px; color: #555; vertical-align: top;">${row.ra}</td>
            <td style="padding: 14px 14px; font-size: 13px; color: #555; vertical-align: top;">${row.estrategiaMet}</td>
            <td style="padding: 14px 14px; font-size: 13px; color: #555; vertical-align: top;">${row.estrategiaEval}</td>
            <td style="padding: 14px 14px; font-size: 13px; color: #555; vertical-align: top;">
                ${row.indicador}
                <button onclick="deleteCompetencyRow(${row.id})" style="background: #fee; color: #b02020; border: none; padding: 4px 8px; border-radius: 4px; font-size: 12px; cursor: pointer; margin-top: 8px; display: block;">Eliminar</button>
            </td>
        </tr>
    `).join('');
}

function deleteCompetencyRow(id) {
    if (!formData.competencies?.matrix) return;
    formData.competencies.matrix = formData.competencies.matrix.filter(row => row.id !== id);
    renderCompetenciesMatrix();
    saveToLocalStorage();
    showAlert('Competencia eliminada', 'success');
}

// Load competencies structure
let competenciesData = null;

async function loadCompetenciesStructure() {
    try {
        const response = await fetch('./competencies-structure.json');
        competenciesData = await response.json();
        initializeCompetenciesForm();
    } catch (error) {
        console.error('Error loading competencies structure:', error);
        showAlert('Error al cargar la estructura de competencias', 'error');
    }
}

function initializeCompetenciesForm() {
    if (!competenciesData) return;

    const moduloSelect = document.getElementById('compModulo');
    moduloSelect.innerHTML = '<option value="">Seleccionar módulo...</option>';

    competenciesData.modulos.forEach(modulo => {
        const option = document.createElement('option');
        option.value = modulo.id;
        option.textContent = modulo.name;
        option.dataset.moduloData = JSON.stringify(modulo);
        moduloSelect.appendChild(option);
    });
}

function updateCompetenciesDropdown() {
    const moduloSelect = document.getElementById('compModulo');
    const competenciaDropdown = document.getElementById('compCompetenciaDropdown');
    const resultadosContainer = document.getElementById('compResultadosCheckboxes');

    const selectedOption = moduloSelect.options[moduloSelect.selectedIndex];
    if (!selectedOption.value) {
        competenciaDropdown.innerHTML = '';
        document.getElementById('compCompetenciaDisplay').textContent = 'Seleccionar competencia...';
        document.getElementById('compCompetencia').value = '';
        resultadosContainer.innerHTML = '<p style="color: #999; font-size: 13px;">Selecciona una competencia primero</p>';
        return;
    }

    const modulo = JSON.parse(selectedOption.dataset.moduloData);
    competenciaDropdown.innerHTML = '';

    window.competenciasDataMap = {}; // Store competencia data for later

    modulo.competencias.forEach(competencia => {
        const item = document.createElement('div');
        item.style.cssText = 'padding: 12px 14px; border-bottom: 1px solid #f0f0f0; cursor: pointer; font-size: 12px; line-height: 1.4; color: #333; transition: background 0.15s;';
        item.onmouseover = function() { this.style.background = '#e8f0ff'; };
        item.onmouseout = function() { this.style.background = 'transparent'; };
        item.textContent = competencia.name;
        item.onclick = function(e) {
            e.stopPropagation();
            selectCompetencia(competencia.id, competencia.name, competencia);
        };
        competenciaDropdown.appendChild(item);
        window.competenciasDataMap[competencia.id] = competencia;
    });

    // If only one competency, select it by default
    if (modulo.competencias.length === 1) {
        selectCompetencia(modulo.competencias[0].id, modulo.competencias[0].name, modulo.competencias[0]);
    } else {
        resultadosContainer.innerHTML = '<p style="color: #999; font-size: 13px;">Selecciona una competencia primero</p>';
    }
}

function selectCompetencia(id, name, competenciaData) {
    document.getElementById('compCompetencia').value = id;
    document.getElementById('compCompetenciaDisplay').textContent = name;
    document.getElementById('compCompetenciaDropdown').style.display = 'none';
    window.currentCompetencia = competenciaData;
    updateResultadosCheckboxes();
}

function toggleCompetenciaDropdown(event) {
    event.preventDefault();
    const dropdown = document.getElementById('compCompetenciaDropdown');
    const isVisible = dropdown.style.display !== 'none';
    dropdown.style.display = isVisible ? 'none' : 'block';
    event.stopPropagation();
}

function updateResultadosCheckboxes() {
    const competenciaId = document.getElementById('compCompetencia').value;
    const resultadosContainer = document.getElementById('compResultadosCheckboxes');

    if (!competenciaId || !window.currentCompetencia) {
        resultadosContainer.innerHTML = '<p style="color: #999; font-size: 13px;">Selecciona una competencia primero</p>';
        return;
    }

    const competencia = window.currentCompetencia;
    resultadosContainer.innerHTML = '';

    competencia.resultados.forEach(resultado => {
        const checkboxLabel = document.createElement('label');
        checkboxLabel.style.cssText = 'display: flex; align-items: flex-start; cursor: pointer; padding: 10px; border-radius: 6px; transition: background 0.2s;';
        checkboxLabel.onmouseover = function() { this.style.background = '#e8f0ff'; };
        checkboxLabel.onmouseout = function() { this.style.background = 'transparent'; };

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = resultado.id;
        checkbox.className = 'comp-resultado-checkbox';
        checkbox.style.cssText = 'margin-right: 10px; cursor: pointer; accent-color: #1D5FA6; margin-top: 2px; flex-shrink: 0;';

        const labelText = document.createElement('span');
        labelText.textContent = resultado.name;
        labelText.style.cssText = 'font-size: 13px; color: #333; line-height: 1.4;';

        checkboxLabel.appendChild(checkbox);
        checkboxLabel.appendChild(labelText);
        resultadosContainer.appendChild(checkboxLabel);
    });

    // If only one resultado, select it by default
    if (competencia.resultados.length === 1) {
        resultadosContainer.querySelector('input[type="checkbox"]').checked = true;
    }
}

function addCompetencyRowFromSelects() {
    const moduloSelect = document.getElementById('compModulo');
    const competenciaSelect = document.getElementById('compCompetencia');
    const resultadosCheckboxes = document.querySelectorAll('.comp-resultado-checkbox:checked');
    const estrategiaMet = document.getElementById('compEstrategiaMet').value;
    const estrategiaEval = document.getElementById('compEstrategiaEval').value;
    const indicador = document.getElementById('compIndicador').value;

    if (!moduloSelect.value || !competenciaSelect.value || resultadosCheckboxes.length === 0) {
        showAlert('Por favor completa Módulo, Competencia y al menos un Resultado de Aprendizaje', 'error');
        return;
    }

    const modulo = JSON.parse(moduloSelect.options[moduloSelect.selectedIndex].dataset.moduloData);
    const competencia = JSON.parse(competenciaSelect.options[competenciaSelect.selectedIndex].dataset.competenciaData);

    if (!formData.competencies) formData.competencies = {};
    if (!formData.competencies.matrix) formData.competencies.matrix = [];

    // Create row for each selected resultado
    Array.from(resultadosCheckboxes).forEach(checkbox => {
        const resultado = competencia.resultados.find(r => r.id === checkbox.value);

        const newRow = {
            id: Date.now() + Math.random(),
            modulo: modulo.name,
            competencia: competencia.name,
            ra: resultado.name,
            estrategiaMet,
            estrategiaEval,
            indicador
        };

        formData.competencies.matrix.push(newRow);
    });

    renderCompetenciesMatrix();

    // Clear form
    moduloSelect.value = '';
    competenciaSelect.innerHTML = '<option value="">Seleccionar competencia...</option>';
    document.getElementById('compResultadosCheckboxes').innerHTML = '<p style="color: #999; font-size: 13px;">Selecciona una competencia primero</p>';
    document.getElementById('compEstrategiaMet').value = '';
    document.getElementById('compEstrategiaEval').value = '';
    document.getElementById('compIndicador').value = '';

    showAlert('Competencia(s) agregada(s) correctamente', 'success');
    saveToLocalStorage();
}
