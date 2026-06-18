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
    await loadTeachingStrategies();
    loadLocalStorage();
    loadVersionsFromStorage();
    renderMallaHoraria();
    renderEvaluationTable();
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
        const { error } = await supabase.from('microcurriculum_versions').select('id').limit(1);
        if (error && error.code !== 'PGRST116') throw error;
        console.log('✓ Supabase connected');
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
    const selectedPrereqs = prerequisitesContainer ? Array.from(prerequisitesContainer.querySelectorAll('input[type="checkbox"]:checked')).map(checkbox => checkbox.value) : [];

    const getElementValue = (id) => {
        const elem = document.getElementById(id);
        return elem ? elem.value : '';
    };

    formData.identification = {
        subjectName: getElementValue('subjectName'),
        subjectCode: getElementValue('subjectCode'),
        semester: getElementValue('semester'),
        credits: getElementValue('credits'),
        hoursPerWeek: getElementValue('hoursPerWeek'),
        module: getElementValue('module'),
        area: getElementValue('area'),
        prerequisites: selectedPrereqs,
        coordinator: getElementValue('coordinator'),
        coordinatorEmail: getElementValue('coordinatorEmail'),
        coordinatorArea: getElementValue('coordinatorArea'),
    };

    formData.presentation = {
        departmentMission: getElementValue('departmentMission'),
        generalObjectives: getElementValue('generalObjectives'),
        specificObjectives: getElementValue('specificObjectives'),
        justification: getElementValue('justification'),
        generalDescription: getElementValue('generalDescription'),
        advisorySpaces: getElementValue('advisorySpaces'),
    };

    // Competencies matrix is already in formData.competencies

    formData.evaluation = {
        diagnostic: getElementValue('diagnosticEvaluation'),
        details: getElementValue('evaluationDetails'),
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
        if (el && el.value && el.value.trim()) filledFields++;
    });

    const presentFields = ['departmentMission', 'generalObjectives', 'specificObjectives', 'justification', 'generalDescription'];
    presentFields.forEach(field => {
        totalFields++;
        const el = document.getElementById(field);
        if (el && el.value && el.value.trim()) filledFields++;
    });

    // Check competencies matrix
    totalFields += 1;
    if (formData.competencies?.matrix && formData.competencies.matrix.length > 0) filledFields++;

    totalFields++;
    const diagEl = document.getElementById('diagnosticEvaluation');
    if (diagEl && diagEl.value && diagEl.value.trim()) filledFields++;

    totalFields++;
    if (formData.evaluationTable && formData.evaluationTable.length > 0) filledFields++;

    const percentage = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;

    document.getElementById('completionPercentage').textContent = percentage + '%';
    document.getElementById('fieldCount').textContent = filledFields;
    const totalTeachers = formData.teachers.length + (formData.identification?.coordinator ? 1 : 0);
    document.getElementById('teachersCount').textContent = totalTeachers;

    const progressBar = document.getElementById('currentProgressBar');
    const progressPercent = document.getElementById('currentProgressPercent');
    if (progressBar) progressBar.style.width = percentage + '%';
    if (progressPercent) progressPercent.textContent = percentage + '%';

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

    const teacherCount = formData.teachers.length + (formData.identification.coordinator ? 1 : 0);
    if (teacherCount === 0) {
        validations.push({ text: 'Al menos un docente o coordinador', status: 'invalid' });
    } else {
        validations.push({ text: `Docentes asignados (${teacherCount})`, status: 'valid' });
    }

    const matrixCount = formData.competencies.matrix?.length || 0;
    if (matrixCount === 0) {
        validations.push({ text: 'Matriz de competencias', status: 'invalid' });
    } else {
        validations.push({ text: `Competencias en matriz (${matrixCount})`, status: 'valid' });
    }

    const raCount = formData.competencies.learningOutcomes?.length || 0;
    if (raCount === 0) {
        validations.push({ text: 'Resultados de Aprendizaje', status: 'warning' });
    } else {
        validations.push({ text: `Resultados de Aprendizaje (${raCount})`, status: 'valid' });
    }

    const hasTopics = formData.methodology.length >= 1;
    const hasMalla = Object.values(formData.mallaHoraria || {}).some(v => v);
    if (!hasTopics && !hasMalla) {
        validations.push({ text: 'Cronograma y malla horaria', status: 'warning' });
    } else {
        const parts = [];
        if (hasTopics) parts.push(`${formData.methodology.length} tema(s)`);
        if (hasMalla) parts.push('malla horaria');
        validations.push({ text: `Cronograma: ${parts.join(', ')}`, status: 'valid' });
    }

    if (!formData.evaluation.diagnostic && !formData.evaluation.details) {
        validations.push({ text: 'Proceso de evaluación', status: 'invalid' });
    } else {
        validations.push({ text: 'Proceso de evaluación', status: 'valid' });
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
    const code = formData.identification?.subjectCode;
    if (code) localStorage.setItem(`microcullo_subject_${code}`, JSON.stringify(formData));
    showAlert('Guardado en almacenamiento local', 'success');
}

function saveLocalStorageSilent() {
    localStorage.setItem('microculloData', JSON.stringify(formData));
    const code = formData.identification?.subjectCode;
    if (code) localStorage.setItem(`microcullo_subject_${code}`, JSON.stringify(formData));
}

function loadLocalStorage() {
    const saved = localStorage.getItem('microculloData');
    if (saved) {
        try {
            formData = JSON.parse(saved);
            loadFormFromData();
            updateStats();
            loadVersionsFromStorage(formData.identification?.subjectCode);
        } catch (e) {
            showAlert('Error al cargar datos', 'error');
        }
    }
}

function loadFormFromData() {
    document.getElementById('subjectName').value = formData.identification?.subjectCode || '';
    document.getElementById('subjectCode').value = formData.identification?.subjectCode || '';
    document.getElementById('semester').value = formData.identification?.semester || '';
    document.getElementById('credits').value = formData.identification?.credits || '';
    document.getElementById('hoursPerWeek').value = formData.identification?.hoursPerWeek || '';
    const moduleEl = document.getElementById('module');
    if (moduleEl) {
        const comp = formData.identification?.component || formData.identification?.module || '';
        if (comp) {
            moduleEl.textContent = comp;
            moduleEl.style.background = 'linear-gradient(135deg, #1D5FA6, #2478C5)';
            moduleEl.style.color = 'white';
        }
    }

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

    // Load methodology topics
    if (formData.methodology && Array.isArray(formData.methodology)) {
        methodologyTopics = formData.methodology;
        renderMethodologyTable();
        renderCronograma();
    }
    document.getElementById('advisorySpaces').value = formData.presentation?.advisorySpaces || '';

    // Load competencies matrix
    renderCompetenciesMatrix();

    document.getElementById('diagnosticEvaluation').value = formData.evaluation?.diagnostic || '';
    document.getElementById('evaluationDetails').value = formData.evaluation?.details || '';
    renderEvaluationTable();

    renderMallaHoraria();
    renderEvaluationTable();
    updateHeaderSubjectName(formData.identification?.subjectName || '');
    updateWordCount('departmentMission');
    updateWordCount('justification');
    updateWordCount('generalDescription');
}

function updateWordCount(fieldId) {
    const textarea = document.getElementById(fieldId);
    const badge = document.getElementById('wc-' + fieldId);
    if (!textarea || !badge) return;
    const count = textarea.value.trim() === '' ? 0 : textarea.value.trim().split(/\s+/).filter(Boolean).length;
    badge.textContent = count + '/250';
    if (count >= 246) {
        badge.style.background = '#f8d7da';
        badge.style.color = '#842029';
    } else if (count >= 221) {
        badge.style.background = '#fff3cd';
        badge.style.color = '#664d03';
    } else {
        badge.style.background = '#e9ecef';
        badge.style.color = '#6c757d';
    }
}

function updateHeaderSubjectName(name) {
    const wrap = document.getElementById('headerSubjectBadgeWrap');
    const span = document.getElementById('headerSubjectName');
    if (!wrap || !span) return;
    if (name) {
        span.textContent = name;
        wrap.style.display = 'block';
    } else {
        wrap.style.display = 'none';
    }
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
            evaluation: {},
            cronograma: [],
            mallaHoraria: {},
            evaluationTable: null
        };
        methodologyTopics = [];

        document.querySelectorAll('input[type="text"], input[type="email"], input[type="number"], textarea, select').forEach(field => {
            field.value = '';
        });

        renderTeachers();
        renderCompetenciesMatrix();
        renderTopics();
        renderSchedule();
        renderMethodologyTable();
        renderCronograma();
        renderMallaHoraria();
        renderEvaluationTable();
        savedVersions = [];
        updateVersionsList();
        updateHeaderSubjectName('');
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

        // Build fresh identification for this subject
        const freshIdentification = {
            subjectName: subject.name,
            subjectCode: subject.code,
            semester: subject.semester,
            credits: subject.credits,
            directTeachingHours: subject.directTeachingHours,
            component: subject.component,
            componentCode: subject.componentCode,
            protected: true
        };

        // Load subject-specific saved data, or start fresh
        const savedRaw = localStorage.getItem(`microcullo_subject_${subject.code}`);
        if (savedRaw) {
            try {
                formData = JSON.parse(savedRaw);
                formData.identification = freshIdentification;
                loadFormFromData();
                showAlert(`✅ ${subject.code} — datos previos restaurados`, 'success');
            } catch (e) {
                resetSubjectForm(freshIdentification);
                showAlert(`✅ Detalles de ${subject.code} cargados`, 'success');
            }
        } else {
            resetSubjectForm(freshIdentification);
            showAlert(`✅ Detalles de ${subject.code} cargados (formulario nuevo)`, 'success');
        }

        loadVersionsFromStorage(subject.code);
        updateHeaderSubjectName(subject.name);
        updateStats();
    } catch (error) {
        console.error('Error loading subject details:', error);
        showAlert('Error al cargar detalles de la asignatura', 'error');
    }
}

function resetSubjectForm(identification) {
    formData = {
        identification,
        teachers: [],
        presentation: {},
        competencies: {},
        methodology: [],
        cronograma: [],
        mallaHoraria: {},
        evaluationTable: null,
        evaluation: {},
        schedule: []
    };
    loadFormFromData();
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
    saveLocalStorage();
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
    saveLocalStorage();
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
    const competenciasContainer = document.getElementById('compCompetenciaCheckboxes');
    const resultadosContainer = document.getElementById('compResultadosCheckboxes');

    const selectedOption = moduloSelect.options[moduloSelect.selectedIndex];
    if (!selectedOption.value) {
        competenciasContainer.innerHTML = '<p style="color: #999; font-size: 12px;">Selecciona un módulo primero</p>';
        document.getElementById('compCompetencia').value = '';
        resultadosContainer.innerHTML = '<p style="color: #999; font-size: 13px;">Selecciona una competencia primero</p>';
        return;
    }

    const modulo = JSON.parse(selectedOption.dataset.moduloData);
    competenciasContainer.innerHTML = '';

    window.competenciasDataMap = {};

    modulo.competencias.forEach(competencia => {
        const label = document.createElement('label');
        label.style.cssText = 'display: flex; align-items: flex-start; cursor: pointer; padding: 12px; border-radius: 6px; transition: background 0.2s; user-select: none;';
        label.onmouseover = function() { this.style.background = '#e8f0ff'; };
        label.onmouseout = function() { this.style.background = 'transparent'; };

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = competencia.id;
        checkbox.style.cssText = 'margin-right: 10px; cursor: pointer; accent-color: #1D5FA6; margin-top: 2px; flex-shrink: 0;';
        checkbox.onchange = function() {
            if (this.checked) {
                selectCompetencia(competencia.id, competencia.name, competencia);
            } else {
                document.getElementById('compCompetencia').value = '';
                resultadosContainer.innerHTML = '<p style="color: #999; font-size: 13px;">Selecciona una competencia</p>';
            }
        };

        const text = document.createElement('span');
        text.textContent = competencia.name;
        text.style.cssText = 'font-size: 12px; line-height: 1.4; color: #333;';

        label.appendChild(checkbox);
        label.appendChild(text);
        competenciasContainer.appendChild(label);

        window.competenciasDataMap[competencia.id] = competencia;
    });

    resultadosContainer.innerHTML = '<p style="color: #999; font-size: 13px;">Selecciona una competencia</p>';
}

function selectCompetencia(id, name, competenciaData) {
    document.getElementById('compCompetencia').value = id;
    window.currentCompetencia = competenciaData;
    updateResultadosCheckboxes();
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
    const competenciaId = document.getElementById('compCompetencia').value;
    const resultadosCheckboxes = document.querySelectorAll('.comp-resultado-checkbox:checked');
    const estrategiaMet = document.getElementById('compEstrategiaMet').value;
    const estrategiaEval = document.getElementById('compEstrategiaEval').value;
    const indicador = document.getElementById('compIndicador').value;

    if (!moduloSelect.value || !competenciaId || resultadosCheckboxes.length === 0) {
        showAlert('Por favor completa Módulo, Competencia y al menos un Resultado de Aprendizaje', 'error');
        return;
    }

    const selectedModuloOption = moduloSelect.options[moduloSelect.selectedIndex];
    const modulo = JSON.parse(selectedModuloOption.dataset.moduloData);
    const competencia = window.currentCompetencia;

    if (!competencia) {
        showAlert('Por favor selecciona una competencia', 'error');
        return;
    }

    if (!formData.competencies) formData.competencies = {};
    if (!formData.competencies.matrix) formData.competencies.matrix = [];

    Array.from(resultadosCheckboxes).forEach(checkbox => {
        const resultado = competencia.resultados.find(r => String(r.id) === String(checkbox.value));
        if (!resultado) return;

        formData.competencies.matrix.push({
            id: Date.now() + Math.random(),
            modulo: modulo.name,
            competencia: competencia.name,
            ra: resultado.name,
            estrategiaMet,
            estrategiaEval,
            indicador
        });
    });

    renderCompetenciesMatrix();

    // Clear form
    moduloSelect.value = '';
    document.getElementById('compCompetencia').value = '';
    document.getElementById('compCompetenciaCheckboxes').innerHTML = '<p style="color: #999; font-size: 12px;">Selecciona un módulo primero</p>';
    document.getElementById('compResultadosCheckboxes').innerHTML = '<p style="color: #999; font-size: 13px;">Selecciona una competencia primero</p>';
    document.getElementById('compEstrategiaMet').value = '';
    document.getElementById('compEstrategiaEval').value = '';
    document.getElementById('compIndicador').value = '';
    window.currentCompetencia = null;

    showAlert('Competencia(s) agregada(s) correctamente', 'success');
    saveLocalStorage();
}

// ============================================
// VERSIONS MANAGEMENT
// ============================================

let savedVersions = [];

function toggleVersionsPanel() {
    const panel = document.getElementById('versionsPanel');
    const icon = document.getElementById('versionsToggleIcon');
    const isOpen = panel.style.display !== 'none';
    panel.style.display = isOpen ? 'none' : 'block';
    icon.textContent = isOpen ? '▼' : '▲';
}

function saveCompleteVersion() {
    collectFormData();

    const versionName = prompt('Nombre de la versión (ej: v1.0 - Propuesta inicial):');
    if (!versionName) return;

    const version = {
        id: Date.now(),
        name: versionName,
        date: new Date().toLocaleString('es-CO'),
        data: JSON.parse(JSON.stringify(formData)),
        progress: getCompletionPercentage()
    };

    savedVersions.push(version);
    const subjectCode = formData.identification?.subjectCode;
    const vKey = subjectCode ? `microapp_versions_${subjectCode}` : 'microapp_versions';
    localStorage.setItem(vKey, JSON.stringify(savedVersions));

    updateVersionsList();
    showAlert(`✅ Versión "${versionName}" guardada correctamente`, 'success');
}

function getCompletionPercentage() {
    const text = document.getElementById('completionPercentage').textContent;
    return parseInt(text) || 0;
}

function updateVersionsList() {
    const container = document.getElementById('versionsList');

    if (savedVersions.length === 0) {
        container.innerHTML = '<p style="color: #999; font-size: 12px;">No hay versiones guardadas</p>';
        return;
    }

    container.innerHTML = savedVersions.map(v => `
        <div style="padding: 12px; border: 1px solid #e0e7ff; border-radius: 6px; margin-bottom: 8px; background: #f8faff;">
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <div>
                    <h5 style="color: #1D5FA6; font-weight: 600; margin: 0 0 4px 0; font-size: 13px;">${v.name}</h5>
                    <p style="color: #666; font-size: 11px; margin: 0;">${v.date}</p>
                </div>
                <div style="text-align: right;">
                    <div style="color: #1D5FA6; font-weight: 600; font-size: 14px;">${v.progress}%</div>
                    <button onclick="loadVersion(${v.id})" style="background: #1D5FA6; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; margin-top: 4px;">Cargar</button>
                </div>
            </div>
        </div>
    `).join('');
}

function loadVersion(versionId) {
    const version = savedVersions.find(v => v.id === versionId);
    if (!version) return;

    formData = JSON.parse(JSON.stringify(version.data));
    loadFormFromData();
    showAlert(`✅ Versión "${version.name}" cargada`, 'success');
}

// Cargar versiones al inicializar (o al cambiar asignatura)
function loadVersionsFromStorage(subjectCode) {
    const vKey = subjectCode ? `microapp_versions_${subjectCode}` : 'microapp_versions';
    let stored = localStorage.getItem(vKey);
    // Backward-compat: migrate old global versions that belong to this subject
    if (!stored && subjectCode) {
        const globalRaw = localStorage.getItem('microapp_versions');
        if (globalRaw) {
            try {
                const global = JSON.parse(globalRaw);
                const mine = global.filter(v => v.data?.identification?.subjectCode === subjectCode);
                if (mine.length > 0) {
                    stored = JSON.stringify(mine);
                    localStorage.setItem(vKey, stored);
                }
            } catch (e) {}
        }
    }
    if (stored) {
        try {
            savedVersions = JSON.parse(stored);
            updateVersionsList();
        } catch (e) {
            console.error('Error loading versions:', e);
        }
    } else {
        savedVersions = [];
        updateVersionsList();
    }
}

// ============================================
// TEACHING STRATEGIES MANAGEMENT
// ============================================

let teachingStrategies = [];
let methodologyTopics = [];

async function loadTeachingStrategies() {
    try {
        const response = await fetch('./teaching-strategies.json');
        const data = await response.json();
        teachingStrategies = data.strategies;

        // Cargar estrategias guardadas personalizadas
        const saved = localStorage.getItem('microapp_custom_strategies');
        if (saved) {
            try {
                const customStrategies = JSON.parse(saved);
                teachingStrategies = [...teachingStrategies, ...customStrategies];
            } catch (e) {
                console.error('Error loading custom strategies:', e);
            }
        }

        renderStrategies();
        populateStrategySelect();
    } catch (error) {
        console.error('Error loading teaching strategies:', error);
    }
}

function renderStrategies() {
    const container = document.getElementById('strategiesContainer');
    container.innerHTML = teachingStrategies.map(s => `
        <div style="background: white; border: 1px solid #dce6ef; border-radius: 6px; padding: 12px; cursor: pointer; transition: all 0.2s;"
             onmouseover="this.style.background='#e8f0ff'; this.style.boxShadow='0 4px 12px rgba(29,95,166,0.1)'"
             onmouseout="this.style.background='white'; this.style.boxShadow='none'"
             onclick="showStrategyDetail('${s.abbreviation}', '${s.name}', \`${s.description}\`)">
            <div style="font-weight: 600; color: #1D5FA6; font-size: 13px; margin-bottom: 6px;">
                ${s.abbreviation}
            </div>
            <div style="font-size: 12px; color: #333; margin-bottom: 4px; font-weight: 500;">
                ${s.name}
            </div>
            <div style="font-size: 11px; color: #666; line-height: 1.3;">
                ${s.description.substring(0, 80)}...
            </div>
            <div style="font-size: 10px; color: #1D5FA6; margin-top: 8px; font-weight: 600;">
                Ver más →
            </div>
        </div>
    `).join('');
}

function showStrategyDetail(abbr, name, description) {
    document.getElementById('strategyAbbrDisplay').textContent = abbr;
    document.getElementById('strategyNameDisplay').textContent = name;
    document.getElementById('strategyDescDisplay').textContent = description;
    document.getElementById('strategyDetailModal').style.display = 'flex';
}

function closeStrategyModal() {
    document.getElementById('strategyDetailModal').style.display = 'none';
}

function populateStrategySelect() {
    const select = document.getElementById('methodStrategy');
    select.innerHTML = '<option value="">Seleccionar estrategia...</option>';

    teachingStrategies.forEach(s => {
        const option = document.createElement('option');
        option.value = s.id;
        option.textContent = `${s.abbreviation} - ${s.name}`;
        select.appendChild(option);
    });
}

function toggleNewStrategyForm() {
    const form = document.getElementById('newStrategyForm');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';

    if (form.style.display === 'block') {
        document.getElementById('newStrategyAbbr').focus();
    }
}

function saveNewStrategy() {
    const abbr = document.getElementById('newStrategyAbbr').value.trim();
    const name = document.getElementById('newStrategyName').value.trim();
    const desc = document.getElementById('newStrategyDesc').value.trim();

    if (!abbr || !name || !desc) {
        showAlert('Por favor completa todos los campos', 'error');
        return;
    }

    // Contar palabras (máximo 100)
    const wordCount = desc.split(/\s+/).length;
    if (wordCount > 100) {
        showAlert(`La descripción tiene ${wordCount} palabras. Máximo 100`, 'error');
        return;
    }

    const newStrategy = {
        id: 'CUSTOM_' + Date.now(),
        abbreviation: abbr.toUpperCase(),
        name: name,
        description: desc
    };

    teachingStrategies.push(newStrategy);

    // Guardar estrategias personalizadas
    const customStrategies = teachingStrategies.filter(s => s.id.startsWith('CUSTOM_'));
    localStorage.setItem('microapp_custom_strategies', JSON.stringify(customStrategies));

    // Limpiar formulario
    document.getElementById('newStrategyAbbr').value = '';
    document.getElementById('newStrategyName').value = '';
    document.getElementById('newStrategyDesc').value = '';

    toggleNewStrategyForm();
    renderStrategies();
    populateStrategySelect();
    showAlert(`✅ Estrategia "${name}" creada correctamente`, 'success');
}

function addMethodologyTopic() {
    const topic = document.getElementById('methodTopic').value.trim();
    const strategyId = document.getElementById('methodStrategy').value;
    const independent = document.getElementById('methodIndependent').value.trim();
    const bibliography = document.getElementById('methodBibliography').value.trim();

    if (!topic || !strategyId) {
        showAlert('Por favor completa Tema y Metodología', 'error');
        return;
    }

    const strategy = teachingStrategies.find(s => s.id === strategyId);

    const newTopic = {
        id: Date.now(),
        topic: topic,
        strategy: strategy,
        independent: independent,
        bibliography: bibliography
    };

    methodologyTopics.push(newTopic);

    // Guardar en formData
    if (!formData.methodology) formData.methodology = [];
    formData.methodology.push(newTopic);

    // Limpiar formulario
    document.getElementById('methodTopic').value = '';
    document.getElementById('methodStrategy').value = '';
    document.getElementById('methodIndependent').value = '';
    document.getElementById('methodBibliography').value = '';

    renderMethodologyTable();
    renderCronograma();
    saveLocalStorage();
    showAlert('✅ Tema agregado correctamente', 'success');
    updateStats();
}

function renderMethodologyTable() {
    const tbody = document.getElementById('methodologyTableBody');

    if (methodologyTopics.length === 0) {
        tbody.innerHTML = `
            <tr style="border-bottom: 1px solid #dce6ef;">
                <td colspan="4" style="padding: 40px 20px; text-align: center; color: #999; font-size: 13px;">
                    No hay temas agregados. Completa el formulario a continuación.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = methodologyTopics.map(t => `
        <tr style="border-bottom: 1px solid #dce6ef; background: #fafbfc;">
            <td style="padding: 14px; font-size: 13px; color: #333;">${t.topic}</td>
            <td style="padding: 14px; font-size: 12px; color: #1D5FA6; font-weight: 600;">
                ${t.strategy.abbreviation}<br>
                <span style="font-size: 11px; color: #666; font-weight: normal;">${t.strategy.name}</span>
            </td>
            <td style="padding: 14px; font-size: 12px; color: #555;">${t.independent || '—'}</td>
            <td style="padding: 14px; font-size: 12px; color: #555;">
                ${t.bibliography || '—'}
                <button onclick="deleteMethodologyTopic(${t.id})" style="background: #fee; color: #b02020; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; margin-top: 8px; display: block;">Eliminar</button>
            </td>
        </tr>
    `).join('');
}

function deleteMethodologyTopic(id) {
    methodologyTopics = methodologyTopics.filter(t => t.id !== id);
    formData.methodology = methodologyTopics;
    renderMethodologyTable();
    renderCronograma();
    saveLocalStorage();
    showAlert('Tema eliminado', 'success');
    updateStats();
}

// ============================================
// CRONOGRAMA
// ============================================

function renderCronograma() {
    const tbody = document.getElementById('cronogramaTableBody');
    if (!tbody) return;

    if (methodologyTopics.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="padding: 30px; text-align: center; color: #999; font-size: 13px;">
                    No hay temas en Contenidos y Metodología. Agrega temas primero.
                </td>
            </tr>`;
        return;
    }

    const cronograma = formData.cronograma || [];
    tbody.innerHTML = methodologyTopics.map((t, idx) => {
        const entry = cronograma.find(c => c.topicId === t.id) || {};
        const rowBg = idx % 2 === 0 ? '#fafbfc' : 'white';
        return `
            <tr style="border-bottom: 1px solid #dce6ef; background: ${rowBg};">
                <td style="padding: 12px 16px; font-size: 13px; color: #333; font-weight: 500;">${t.topic}</td>
                <td style="padding: 8px 12px; text-align: center;">
                    <input type="number" min="1" max="20" value="${entry.semana || ''}"
                           placeholder="—"
                           style="width: 62px; padding: 7px; border: 1px solid #dce6ef; border-radius: 6px; font-size: 13px; text-align: center;"
                           onchange="saveCronogramaField(${t.id}, 'semana', this.value)">
                </td>
                <td style="padding: 8px 12px;">
                    <input type="text" value="${entry.fechas || ''}"
                           placeholder="Ej: 10/02 ó 10-14/02"
                           style="width: 100%; min-width: 150px; padding: 7px 10px; border: 1px solid #dce6ef; border-radius: 6px; font-size: 13px;"
                           onchange="saveCronogramaField(${t.id}, 'fechas', this.value)">
                </td>
                <td style="padding: 8px 12px;">
                    <input type="text" value="${entry.observaciones || ''}"
                           placeholder="Observaciones..."
                           style="width: 100%; min-width: 180px; padding: 7px 10px; border: 1px solid #dce6ef; border-radius: 6px; font-size: 13px;"
                           onchange="saveCronogramaField(${t.id}, 'observaciones', this.value)">
                </td>
            </tr>`;
    }).join('');
}

function saveCronogramaField(topicId, field, value) {
    if (!formData.cronograma) formData.cronograma = [];
    let entry = formData.cronograma.find(c => c.topicId === topicId);
    if (!entry) {
        entry = { topicId };
        formData.cronograma.push(entry);
    }
    entry[field] = value;
    saveLocalStorageSilent();
}

// ============================================
// MALLA HORARIA SEMANAL
// ============================================

function renderMallaHoraria() {
    const tbody = document.getElementById('mallaHorariaBody');
    if (!tbody) return;

    const slots = [];
    for (let h = 6; h <= 20; h++) {
        slots.push(`${String(h).padStart(2,'0')}:00 – ${String(h+1).padStart(2,'0')}:00`);
    }

    const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];
    const malla = formData.mallaHoraria || {};

    tbody.innerHTML = slots.map((slot, hIdx) => {
        const rowBg = hIdx % 2 === 0 ? '#fafbfc' : 'white';
        const cells = days.map(day => {
            const key = `${day}_${hIdx}`;
            const val = malla[key] || '';
            const active = !!val;
            const cellStyle = active
                ? 'background:#dbeafe; color:#1D5FA6; font-weight:600; border:1px solid #93c5fd;'
                : 'background:white; color:#333; border:1px solid transparent;';
            return `<td style="padding: 3px 6px; border-right: 1px solid #dce6ef;">
                <div data-key="${key}"
                     onclick="toggleMallaCell('${key}')"
                     style="min-height: 36px; padding: 6px 8px; border-radius: 6px; font-size: 12px; text-align: center; cursor: pointer; transition: all 0.15s; user-select: none; ${cellStyle}"
                >${val}</div>
            </td>`;
        }).join('');
        return `<tr style="border-bottom: 1px solid #dce6ef; background: ${rowBg};">
            <td style="padding: 10px 12px; text-align: center; font-weight: 600; color: #1D5FA6; font-size: 11px; border-right: 1px solid #dce6ef; white-space: nowrap; background: ${rowBg};">${slot}</td>
            ${cells}
        </tr>`;
    }).join('');
}

function toggleMallaCell(key) {
    const subjectName = formData.identification?.subjectName;
    if (!subjectName) {
        showAlert('Selecciona primero una asignatura en Identificación', 'warning');
        return;
    }
    if (!formData.mallaHoraria) formData.mallaHoraria = {};
    formData.mallaHoraria[key] = formData.mallaHoraria[key] ? '' : subjectName;
    saveLocalStorageSilent();

    const cell = document.querySelector(`[data-key="${key}"]`);
    if (!cell) return;
    const active = !!formData.mallaHoraria[key];
    cell.textContent = formData.mallaHoraria[key] || '';
    if (active) {
        cell.style.background = '#dbeafe';
        cell.style.color = '#1D5FA6';
        cell.style.fontWeight = '600';
        cell.style.border = '1px solid #93c5fd';
    } else {
        cell.style.background = 'white';
        cell.style.color = '#333';
        cell.style.fontWeight = '';
        cell.style.border = '1px solid transparent';
    }
}

// ============================================
// TABLA DE EVALUACIÓN
// ============================================

function initDefaultEvaluationTable() {
    formData.evaluationTable = [
        {
            id: 1, nombre: 'Nota Previa', porcentaje: '70%',
            momentos: [
                {
                    id: 11, nombre: 'Primera Evaluación', porcentaje: '30%',
                    tipos: [
                        { id: 111, nombre: 'Examen escrito o Evaluación oral', porcentaje: '70%' },
                        { id: 112, nombre: 'Prácticas de laboratorio', porcentaje: '30%' },
                        { id: 113, nombre: 'Otras actividades evaluativas', porcentaje: '' }
                    ]
                },
                {
                    id: 12, nombre: 'Segunda Evaluación', porcentaje: '35%',
                    tipos: [
                        { id: 121, nombre: 'Examen escrito o Evaluación oral', porcentaje: '70%' },
                        { id: 122, nombre: 'Prácticas de laboratorio', porcentaje: '30%' },
                        { id: 123, nombre: 'Otras actividades evaluativas', porcentaje: '' }
                    ]
                },
                {
                    id: 13, nombre: 'Tercera Evaluación', porcentaje: '35%',
                    tipos: [
                        { id: 131, nombre: 'Examen escrito o Evaluación oral', porcentaje: '70%' },
                        { id: 132, nombre: 'Prácticas de laboratorio', porcentaje: '30%' },
                        { id: 133, nombre: 'Otras actividades evaluativas', porcentaje: '' }
                    ]
                }
            ]
        },
        {
            id: 2, nombre: 'Examen Final', porcentaje: '30%',
            momentos: [
                {
                    id: 21, nombre: 'Evaluación Final', porcentaje: '30%',
                    tipos: [
                        { id: 211, nombre: 'Examen escrito', porcentaje: '50%' },
                        { id: 212, nombre: 'Sustentación de esquemas integración metabólica', porcentaje: '30%' },
                        { id: 213, nombre: 'Sustentación de correlación básico clínica', porcentaje: '20%' }
                    ]
                }
            ]
        }
    ];
}

function renderEvaluationTable() {
    const tbody = document.getElementById('evalTableBody');
    if (!tbody) return;

    if (!formData.evaluationTable || !formData.evaluationTable.length) {
        initDefaultEvaluationTable();
    }

    const b = 'border: 1px solid #dce6ef;';
    const inputBase = 'border: 1px solid transparent; border-radius: 4px; font-size: 13px; background: transparent; padding: 5px 7px; width: 100%;';
    const inputFocus = `onfocus="this.style.borderColor='#2478C5'; this.style.background='#f0f7ff';" onblur="this.style.borderColor='transparent'; this.style.background='transparent';`;

    const rows = [];

    formData.evaluationTable.forEach((tiempo, tIdx) => {
        const tiempoTotal = tiempo.momentos.reduce((s, m) => s + m.tipos.length, 0);
        const tiempoBg = tIdx % 2 === 0 ? '#eef3fa' : '#e4edf8';

        tiempo.momentos.forEach((momento, mIdx) => {
            const mRows = momento.tipos.length;

            momento.tipos.forEach((tipo, tipoIdx) => {
                const cells = [];

                if (mIdx === 0 && tipoIdx === 0) {
                    cells.push(`<td rowspan="${tiempoTotal}" style="${b} vertical-align:middle; text-align:center; background:${tiempoBg}; padding:10px 8px;">
                        <div style="display:flex;flex-direction:column;align-items:center;gap:5px;">
                            <input type="text" value="${tiempo.nombre}"
                                   style="${inputBase} font-weight:700; font-size:13px; text-align:center;"
                                   ${inputFocus} saveEvalTiempo(${tiempo.id},'nombre',this.value)">
                            <input type="text" value="${tiempo.porcentaje}"
                                   style="${inputBase} width:65px; font-weight:600; color:#1D5FA6; font-size:12px; text-align:center;"
                                   ${inputFocus} saveEvalTiempo(${tiempo.id},'porcentaje',this.value);"
                                   oninput="saveEvalTiempo(${tiempo.id},'porcentaje',this.value); updateEvalTotals();">
                            <div style="display:flex;gap:4px;margin-top:2px;">
                                <button onclick="addEvalMomento(${tiempo.id})"
                                        style="background:#e8f6ee; color:#1a7a4a; border:1px solid #a8d8a8; padding:3px 8px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:600;">＋ Momento</button>
                                <button onclick="deleteEvalTiempo(${tiempo.id})"
                                        style="background:#fee8e8; color:#b02020; border:1px solid #f5b5b5; padding:3px 7px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:600;" title="Eliminar tiempo">× Tiempo</button>
                            </div>
                        </div>
                    </td>`);
                }

                if (tipoIdx === 0) {
                    cells.push(`<td rowspan="${mRows}" style="${b} vertical-align:middle; text-align:center; background:#f5f8fc; padding:10px 8px;">
                        <div style="display:flex;flex-direction:column;align-items:center;gap:5px;">
                            <input type="text" value="${momento.nombre}"
                                   style="${inputBase} font-weight:600; font-size:13px; text-align:center;"
                                   ${inputFocus} saveEvalMomento(${tiempo.id},${momento.id},'nombre',this.value)">
                            <input type="text" value="${momento.porcentaje}"
                                   style="${inputBase} width:65px; font-weight:600; color:#1D5FA6; font-size:12px; text-align:center;"
                                   ${inputFocus} saveEvalMomento(${tiempo.id},${momento.id},'porcentaje',this.value);"
                                   oninput="saveEvalMomento(${tiempo.id},${momento.id},'porcentaje',this.value); updateEvalTotals();">
                            <div style="display:flex;gap:4px;margin-top:2px;">
                                <button onclick="addEvalTipo(${tiempo.id},${momento.id})"
                                        style="background:#e8f6ee; color:#1a7a4a; border:1px solid #a8d8a8; padding:3px 9px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:600;">+ Fila</button>
                                <button onclick="deleteEvalMomento(${tiempo.id},${momento.id})"
                                        style="background:#fee8e8; color:#b02020; border:1px solid #f5b5b5; padding:3px 7px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:600;" title="Eliminar momento">× Momento</button>
                            </div>
                        </div>
                    </td>`);
                }

                cells.push(`<td style="${b} background:white; padding:6px 8px;">
                    <input type="text" value="${tipo.nombre}"
                           style="${inputBase}"
                           ${inputFocus} saveEvalTipo(${tiempo.id},${momento.id},${tipo.id},'nombre',this.value)">
                </td>`);

                cells.push(`<td style="${b} background:white; padding:6px 8px; text-align:center; white-space:nowrap;">
                    <input type="text" value="${tipo.porcentaje}" placeholder="—"
                           style="width:52px; padding:5px 4px; border:1px solid #dce6ef; border-radius:4px; text-align:center; font-size:13px; font-weight:600; color:#1D5FA6;"
                           onblur="saveEvalTipo(${tiempo.id},${momento.id},${tipo.id},'porcentaje',this.value)"
                           oninput="saveEvalTipo(${tiempo.id},${momento.id},${tipo.id},'porcentaje',this.value); updateEvalTotals();">
                    <button onclick="deleteEvalTipo(${tiempo.id},${momento.id},${tipo.id})"
                            style="background:#fee8e8; color:#b02020; border:1px solid #f5b5b5; padding:3px 7px; border-radius:4px; font-size:12px; cursor:pointer; margin-left:4px;" title="Eliminar fila">×</button>
                </td>`);

                rows.push(`<tr>${cells.join('')}</tr>`);
            });
        });
    });

    // Fila de total
    const total = formData.evaluationTable.reduce((sum, t) => {
        return sum + (parseFloat(t.porcentaje) || 0);
    }, 0);
    const totalOk = Math.abs(total - 100) < 0.01;
    const totalColor = totalOk ? '#1a7a4a' : '#b02020';
    const totalBg = totalOk ? '#e8f6ee' : '#fee8e8';
    rows.push(`<tr id="evalTotalRow" style="border-top: 2px solid #1D5FA6;">
        <td colspan="3" style="padding: 13px 16px; text-align: right; font-weight: 700; font-size: 14px; color: #1D5FA6; border: 1px solid #dce6ef; background: #f0f4f8;">
            Total Nota Final
        </td>
        <td style="padding: 13px 16px; text-align: center; font-size: 15px; font-weight: 700; color: ${totalColor}; background: ${totalBg}; border: 1px solid #dce6ef;">
            ${total}%${totalOk ? ' ✓' : ' ⚠️ debe ser 100%'}
        </td>
    </tr>`);

    tbody.innerHTML = rows.join('');
    renderEvalQualityPanel();
}

function renderEvalQualityPanel() {
    const panel = document.getElementById('evalQualityPanel');
    if (!panel || !formData.evaluationTable) return;

    const table = formData.evaluationTable;
    const fmt = (n) => (Math.round(n * 100) / 100) + '%';
    const badge = (ok) => ok
        ? `<span style="color:#1a7a4a; font-weight:700;">✓ 100%</span>`
        : `<span style="color:#b02020; font-weight:700;">⚠️ no suma 100%</span>`;

    // Top-level: sum of tiempos
    const totalTiempos = table.reduce((s, t) => s + (parseFloat(t.porcentaje) || 0), 0);
    const tiemposOk = Math.abs(totalTiempos - 100) < 0.01;

    // Per-tiempo: sum of its momentos + per-momento: sum of its tipos
    const subRows = table.flatMap(t => {
        const sumMomentos = t.momentos.reduce((s, m) => s + (parseFloat(m.porcentaje) || 0), 0);
        const momentosOk = Math.abs(sumMomentos - 100) < 0.01;
        const momentosParts = t.momentos.map(m => `${m.nombre} ${m.porcentaje || '?'}`).join(' + ');

        const tiempoRow = `<tr style="border-bottom: 1px solid #e8eef4; background: ${momentosOk ? 'transparent' : '#fff8f8'};">
            <td style="padding: 8px 14px 8px 20px; font-size: 13px; color: #555;">
                Momentos de <strong>${t.nombre}</strong>
            </td>
            <td style="padding: 8px 14px; font-size: 12px; color: #888;">${momentosParts}</td>
            <td style="padding: 8px 14px; text-align: center; font-size: 13px;">
                ${fmt(sumMomentos)} &nbsp; ${badge(momentosOk)}
            </td>
        </tr>`;

        const tipoRows = t.momentos.map(m => {
            const sumTipos = m.tipos.reduce((s, ti) => s + (parseFloat(ti.porcentaje) || 0), 0);
            const tiposOk = Math.abs(sumTipos - 100) < 0.01;
            const tiposParts = m.tipos.map(ti => `${ti.nombre} ${ti.porcentaje || '?'}`).join(' + ');
            return `<tr style="border-bottom: 1px solid #e8eef4; background: ${tiposOk ? 'transparent' : '#fff8f8'};">
                <td style="padding: 6px 14px 6px 34px; font-size: 12px; color: #777;">
                    Tipos de <em>${m.nombre}</em>
                </td>
                <td style="padding: 6px 14px; font-size: 11px; color: #aaa;">${tiposParts}</td>
                <td style="padding: 6px 14px; text-align: center; font-size: 12px;">
                    ${fmt(sumTipos)} &nbsp; ${badge(tiposOk)}
                </td>
            </tr>`;
        }).join('');

        return [tiempoRow, tipoRows];
    }).join('');

    const tiemposParts = table.map(t => `${t.nombre} ${t.porcentaje || '?'}`).join(' + ');

    panel.innerHTML = `
        <div style="background: #f9fbfd; border: 1px solid #dce6ef; border-radius: 8px; overflow: hidden;">
            <div style="background: linear-gradient(135deg, #1D5FA6, #2478C5); color: white; padding: 10px 16px; font-weight: 600; font-size: 13px;">
                📊 Control de Calidad — Ponderaciones
            </div>
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: #eef3fa; font-size: 12px; color: #5a6e85; font-weight: 600;">
                        <th style="padding: 8px 14px; text-align: left; border-bottom: 1px solid #dce6ef;">Nivel</th>
                        <th style="padding: 8px 14px; text-align: left; border-bottom: 1px solid #dce6ef;">Componentes</th>
                        <th style="padding: 8px 14px; text-align: center; border-bottom: 1px solid #dce6ef; width: 160px;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    <tr style="border-bottom: 1px solid #e8eef4; background: ${tiemposOk ? '#f0faf4' : '#fef3f3'};">
                        <td style="padding: 10px 14px; font-size: 13px; font-weight: 700; color: #1D5FA6;">
                            Nota Final
                        </td>
                        <td style="padding: 10px 14px; font-size: 12px; color: #888;">${tiemposParts}</td>
                        <td style="padding: 10px 14px; text-align: center; font-size: 14px;">
                            ${fmt(totalTiempos)} &nbsp; ${badge(tiemposOk)}
                        </td>
                    </tr>
                    ${subRows}
                </tbody>
            </table>
        </div>`;
}

function deleteEvalMomento(tiempoId, momentoId) {
    const t = formData.evaluationTable?.find(t => t.id === tiempoId);
    if (!t) return;

    const isLast = t.momentos.length <= 1;
    const msg = isLast
        ? `¿Eliminar este momento? El bloque "${t.nombre}" también quedará eliminado.`
        : '¿Eliminar este momento evaluativo y todos sus tipos?';

    if (!confirm(msg)) return;

    t.momentos = t.momentos.filter(m => m.id !== momentoId);
    if (t.momentos.length === 0) {
        formData.evaluationTable = formData.evaluationTable.filter(ti => ti.id !== tiempoId);
    }

    renderEvaluationTable();
    saveLocalStorageSilent();
}

function updateEvalTotals() {
    const table = formData.evaluationTable || [];
    const total = table.reduce((s, t) => s + (parseFloat(t.porcentaje) || 0), 0);
    const totalOk = Math.abs(total - 100) < 0.01;
    const row = document.getElementById('evalTotalRow');
    if (row) {
        const td = row.querySelector('td:last-child');
        if (td) {
            td.style.color = totalOk ? '#1a7a4a' : '#b02020';
            td.style.background = totalOk ? '#e8f6ee' : '#fee8e8';
            td.innerHTML = `${total}%${totalOk ? ' ✓' : ' ⚠️ debe ser 100%'}`;
        }
    }
    renderEvalQualityPanel();
}

function saveEvalTiempo(tiempoId, field, value) {
    const t = formData.evaluationTable?.find(t => t.id === tiempoId);
    if (t) { t[field] = value; saveLocalStorageSilent(); }
}

function saveEvalMomento(tiempoId, momentoId, field, value) {
    const t = formData.evaluationTable?.find(t => t.id === tiempoId);
    const m = t?.momentos?.find(m => m.id === momentoId);
    if (m) { m[field] = value; saveLocalStorageSilent(); }
}

function saveEvalTipo(tiempoId, momentoId, tipoId, field, value) {
    const t = formData.evaluationTable?.find(t => t.id === tiempoId);
    const m = t?.momentos?.find(m => m.id === momentoId);
    const tipo = m?.tipos?.find(ti => ti.id === tipoId);
    if (tipo) { tipo[field] = value; saveLocalStorageSilent(); }
}

function addEvalTipo(tiempoId, momentoId) {
    const t = formData.evaluationTable?.find(t => t.id === tiempoId);
    const m = t?.momentos?.find(m => m.id === momentoId);
    if (!m) return;
    m.tipos.push({ id: Date.now(), nombre: 'Nueva actividad evaluativa', porcentaje: '' });
    renderEvaluationTable();
    saveLocalStorageSilent();
}

function deleteEvalTipo(tiempoId, momentoId, tipoId) {
    const t = formData.evaluationTable?.find(t => t.id === tiempoId);
    const m = t?.momentos?.find(m => m.id === momentoId);
    if (!m || m.tipos.length <= 1) {
        showAlert('Debe haber al menos un tipo por momento evaluativo', 'warning');
        return;
    }
    m.tipos = m.tipos.filter(ti => ti.id !== tipoId);
    renderEvaluationTable();
    saveLocalStorageSilent();
}

function addEvalTiempo() {
    if (!formData.evaluationTable) formData.evaluationTable = [];
    const newId = Date.now();
    formData.evaluationTable.push({
        id: newId,
        nombre: 'Nuevo Tiempo Evaluativo',
        porcentaje: '',
        momentos: [{
            id: newId + 1,
            nombre: 'Nuevo Momento',
            porcentaje: '',
            tipos: [{ id: newId + 2, nombre: 'Nueva actividad evaluativa', porcentaje: '' }]
        }]
    });
    renderEvaluationTable();
    saveLocalStorageSilent();
}

function deleteEvalTiempo(tiempoId) {
    if (!confirm('¿Eliminar este tiempo evaluativo y todos sus momentos y tipos?')) return;
    formData.evaluationTable = formData.evaluationTable.filter(t => t.id !== tiempoId);
    renderEvaluationTable();
    saveLocalStorageSilent();
}

function addEvalMomento(tiempoId) {
    const t = formData.evaluationTable?.find(t => t.id === tiempoId);
    if (!t) return;
    const newId = Date.now();
    t.momentos.push({
        id: newId,
        nombre: 'Nuevo Momento',
        porcentaje: '',
        tipos: [{ id: newId + 1, nombre: 'Nueva actividad evaluativa', porcentaje: '' }]
    });
    renderEvaluationTable();
    saveLocalStorageSilent();
}
