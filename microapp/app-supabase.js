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
let planMedicinaData = null;

// Initialize
document.addEventListener('DOMContentLoaded', async function() {
    // Init UI immediately — never block on network
    initializeTabs();
    await populateSubjectDropdown();
    await loadCompetenciesStructure();
    await loadTeachingStrategies();
    await loadPlanMedicina();
    loadLocalStorage();
    renderMallaHoraria();
    renderEvaluationTable();
    updateStats();

    // Supabase in background — UI stays fully usable regardless
    testSupabaseConnection().then(connected => {
        updateSyncStatus(connected);
        supabaseReady = connected;
        if (connected) loadMicrocurriculums();
    });

    // Auto-save on every input/change when a subject is selected
    document.addEventListener('input', function() {
        if (formData.identification?.subjectCode) saveLocalStorageSilent();
    });
    document.addEventListener('change', function() {
        if (formData.identification?.subjectCode) saveLocalStorageSilent();
    });

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
    if (!supabase) return false;
    try {
        const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 5000)
        );
        const test = supabase.from('microcurriculum_versions').select('id').limit(1);
        const { error } = await Promise.race([test, timeout]);
        if (error && error.code !== 'PGRST116') throw error;
        console.log('✓ Supabase connected');
        return true;
    } catch (error) {
        console.warn('Supabase no disponible, usando almacenamiento local:', error.message);
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
                created_by: null,
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
    if (tabName === 'preview') generatePreview();
    if (tabName === 'export') renderSavedVersions();
}

// Alert System
function showAlert(message, type = 'success') {
    const alertDiv = document.getElementById('alert');
    alertDiv.textContent = message;
    alertDiv.className = `alert alert-${type} show`;
    setTimeout(() => alertDiv.classList.remove('show'), 4000);
}

// Teachers Management
function addCoordinator() {
    const name = document.getElementById('coordinator').value.trim();
    const email = document.getElementById('coordinatorEmail').value.trim();
    const area = document.getElementById('coordinatorArea').value.trim();

    if (!name || !email || !area) {
        showAlert('Completa los tres campos del coordinador', 'error');
        return;
    }

    collectFormData();
    saveLocalStorageSilent();
    updateStats();
    showAlert('Coordinador guardado', 'success');
}

function addTeacher() {
    const name = document.getElementById('teacherName').value.trim();
    const email = document.getElementById('teacherEmail').value.trim();
    const area = document.getElementById('teacherArea').value.trim();

    if (!name || !email || !area) {
        showAlert('Completa todos los campos del profesor', 'error');
        return;
    }

    formData.teachers.push({ name, email, area, id: Date.now() });
    document.getElementById('teacherName').value = '';
    document.getElementById('teacherEmail').value = '';
    document.getElementById('teacherArea').value = '';
    renderTeachers();
    showAlert('Profesor agregado', 'success');
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

    const prevId = formData.identification;

    formData.identification = {
        subjectName: getElementValue('subjectName'),
        subjectCode: getElementValue('subjectCode'),
        semester: getElementValue('semester'),
        credits: getElementValue('credits'),
        hoursPerWeek: getElementValue('hoursPerWeek') || prevId?.directTeachingHours || prevId?.hoursPerWeek,
        module: getElementValue('module'),
        area: getElementValue('area'),
        prerequisites: selectedPrereqs,
        coordinator: getElementValue('coordinator'),
        coordinatorEmail: getElementValue('coordinatorEmail'),
        coordinatorArea: getElementValue('coordinatorArea'),
        // Preserve protected fields that live only in formData, not the DOM
        directTeachingHours: prevId?.directTeachingHours,
        component: prevId?.component,
        componentCode: prevId?.componentCode,
        protected: prevId?.protected,
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

    // Identification (5 verifiable fields)
    const identFields = ['subjectCode', 'semester', 'credits', 'hoursPerWeek', 'coordinator'];
    identFields.forEach(field => {
        totalFields++;
        const val = field === 'coordinator'
            ? (formData.identification?.coordinator || document.getElementById('coordinator')?.value || '')
            : (document.getElementById(field)?.value || '');
        if (val.trim()) filledFields++;
    });

    // Presentation (6 fields)
    const presentFields = ['departmentMission', 'generalObjectives', 'specificObjectives', 'justification', 'generalDescription', 'advisorySpaces'];
    presentFields.forEach(field => {
        totalFields++;
        const el = document.getElementById(field);
        if (el && el.value && el.value.trim()) filledFields++;
    });

    // Competencies matrix
    totalFields += 1;
    if (formData.competencies?.matrix && formData.competencies.matrix.length > 0) filledFields++;

    // Evaluation process description
    totalFields++;
    const diagEl = document.getElementById('diagnosticEvaluation');
    if (diagEl && diagEl.value && diagEl.value.trim()) filledFields++;

    // Evaluation table configured
    totalFields++;
    if (formData.evaluationTable && formData.evaluationTable.length > 0) filledFields++;

    const percentage = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;

    document.getElementById('completionPercentage').textContent = percentage + '%';
    document.getElementById('fieldCount').textContent = filledFields;
    const totalTeachers = formData.teachers.length + (formData.identification?.coordinator ? 1 : 0);
    document.getElementById('teachersCount').textContent = totalTeachers;

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
        validations.push({ text: 'Al menos un profesor o coordinador', status: 'invalid' });
    } else {
        validations.push({ text: `Profesores asignados (${teacherCount})`, status: 'valid' });
    }

    const matrixCount = formData.competencies.matrix?.length || 0;
    if (matrixCount === 0) {
        validations.push({ text: 'Matriz de competencias', status: 'invalid' });
    } else {
        validations.push({ text: `Competencias en matriz (${matrixCount})`, status: 'valid' });
    }

    const raCount = (formData.competencies.matrix || []).filter(r => r.ra?.trim()).length;
    if (raCount === 0) {
        validations.push({ text: 'Resultados de Aprendizaje: ninguno registrado', status: 'invalid' });
    } else {
        validations.push({ text: `Resultados de Aprendizaje (${raCount})`, status: 'valid' });
    }

    const hasTopics = formData.methodology.length >= 1;
    if (!hasTopics) {
        validations.push({ text: 'Cronograma: sin temas registrados', status: 'warning' });
    } else {
        validations.push({ text: `Cronograma: ${formData.methodology.length} tema(s)`, status: 'valid' });
    }

    const evalTotal = (formData.evaluationTable || []).reduce((s, t) => s + (parseFloat(t.porcentaje) || 0), 0);
    const evalOk = Math.abs(evalTotal - 100) < 0.01;
    if (!evalOk) {
        validations.push({ text: `Evaluación: ponderaciones suman ${evalTotal}% (debe ser 100%)`, status: 'invalid' });
    } else {
        validations.push({ text: 'Evaluación: ponderaciones al 100%', status: 'valid' });
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

// ── Export helpers ───────────────────────────────────────
function getExportMeta() {
    const subjectSelect = document.getElementById('subjectName');
    const selectedOpt = subjectSelect?.options[subjectSelect.selectedIndex];
    const subjectJson = selectedOpt?.dataset?.subjectData ? JSON.parse(selectedOpt.dataset.subjectData) : null;
    const realName = subjectJson?.name || formData.identification?.subjectName || formData.identification?.subjectCode || '';
    const moduleBtn = document.getElementById('module');
    const realModule = formData.identification?.component || (moduleBtn?.textContent?.trim() !== 'Módulo' ? moduleBtn?.textContent?.trim() : '') || '';
    const prereqItems = (formData.identification?.prerequisites || []).map(code => {
        const labelSpan = document.getElementById(`prereq_${code}`)?.parentElement?.querySelector('span');
        return labelSpan?.textContent?.trim() ? `${code} — ${labelSpan.textContent.trim()}` : code;
    });
    return { realName, realModule, prereqItems };
}

function buildMarkdownBody(fd, realName, realModule, prereqItems) {
    const id = fd.identification || {};
    const pres = fd.presentation || {};
    const comp = fd.competencies || {};
    const matrix = comp.matrix || [];
    const topics = fd.methodology || [];
    const cronograma = fd.cronograma || [];
    const rotaciones = fd.rotaciones || [];
    const teachers = fd.teachers || [];
    const evalTable = fd.evaluationTable || [];
    const na = v => v || '—';
    const nl = '\n';

    let md = '';

    // 1. Identificación
    md += `# Identificación\n\n`;
    md += `## Datos de identificación\n\n`;
    md += `| Campo | Valor |\n|---|---|\n`;
    md += `| Nombre | ${na(realName)} |\n`;
    md += `| Código | ${na(id.subjectCode)} |\n`;
    md += `| Semestre | ${na(id.semester)} |\n`;
    md += `| Créditos | ${na(id.credits)} |\n`;
    md += `| Horas docencia directa/sem | ${na(id.directTeachingHours||id.hoursPerWeek)} |\n`;
    md += `| Módulo / Componente | ${na(realModule)} |\n\n`;
    md += `## Prerrequisitos\n\n`;
    md += prereqItems.length ? prereqItems.map((p,i) => `${i+1}. ${p}`).join(nl) + nl : '_Sin prerrequisitos definidos._\n';

    // 2. Profesores
    md += `\n# Profesores\n\n`;
    md += `## Coordinador\n\n`;
    if (id.coordinator) {
        md += `| Campo | Valor |\n|---|---|\n`;
        md += `| Nombre | ${id.coordinator} |\n`;
        md += `| Email | ${na(id.coordinatorEmail)} |\n`;
        md += `| Perfil profesional | ${na(id.coordinatorArea)} |\n\n`;
    } else { md += `_Sin coordinador registrado._\n\n`; }
    md += `## Cuerpo docente\n\n`;
    if (teachers.length) {
        md += `| Nombre | Email | Perfil profesional |\n|---|---|---|\n`;
        md += teachers.map(t => `| ${na(t.name)} | ${na(t.email)} | ${na(t.area)} |`).join(nl) + nl;
    } else { md += `_Sin docentes registrados._\n`; }

    // 3. Presentación
    md += `\n# Presentación\n\n`;
    const presMap = [
        ['Presentación de la Asignatura', pres.departmentMission],
        ['Objetivo General', pres.generalObjectives],
        ['Objetivos Específicos', pres.specificObjectives],
        ['Justificación de la Asignatura', pres.justification],
        ['Descripción General de la Asignatura', pres.generalDescription],
        ['Espacios de Asesorías', pres.advisorySpaces],
    ];
    presMap.forEach(([label, val]) => {
        if (val) md += `### ${label}\n\n${val}\n\n`;
    });
    if (!presMap.some(([,v]) => v)) md += `_Sin información de presentación._\n`;

    // 4. Competencias
    md += `\n# Competencias\n\n`;
    md += `## Matriz de competencias\n\n`;
    if (matrix.length) {
        md += `| # | Módulo | Competencia | Resultado de Aprendizaje | Estrategia Metodológica | Estrategia Evaluativa | Indicador |\n`;
        md += `|---|---|---|---|---|---|---|\n`;
        md += matrix.map((m,i) => `| ${i+1} | ${na(m.modulo)} | ${na(m.competencia)} | ${na(m.ra)} | ${na(m.estrategiaMet)} | ${na(m.estrategiaEval)} | ${na(m.indicador)} |`).join(nl) + nl;
    } else { md += `_Sin filas en la matriz de competencias._\n`; }

    // 5. Metodología y Contenidos
    md += `\n# Metodología y Contenidos\n\n`;
    md += `## Temas y estrategias pedagógicas\n\n`;
    if (topics.length) {
        md += `| # | Tema / Unidad | Estrategia(s) | Trabajo independiente | Bibliografía |\n`;
        md += `|---|---|---|---|---|\n`;
        md += topics.map((t,i) => {
            const strats = Array.isArray(t.strategies) ? t.strategies.join(', ') : (t.strategy||'');
            return `| ${i+1} | ${na(t.topic)} | ${na(strats)} | ${na(t.independent)} | ${na(t.bibliography)} |`;
        }).join(nl) + nl;
    } else { md += `_Sin temas registrados._\n`; }

    // 6. Sistema de Evaluación
    md += `\n# Sistema de Evaluación\n\n`;
    md += `## Proceso de evaluación\n\n`;
    md += fd.evaluation?.diagnostic ? `${fd.evaluation.diagnostic}\n\n` : `_Sin descripción del proceso evaluativo._\n\n`;
    md += `## Tabla de calificación\n\n`;
    if (evalTable.length) {
        md += `| Tiempo evaluativo | Momento | Tipo de evaluación | % |\n|---|---|---|---|\n`;
        evalTable.forEach(tiempo => {
            tiempo.momentos?.forEach(momento => {
                momento.tipos?.forEach((tipo, ti) => {
                    const t = ti === 0 && tiempo.momentos[0] === momento ? `**${na(tiempo.nombre)}** (${na(tiempo.porcentaje)})` : '';
                    const m = ti === 0 ? `${na(momento.nombre)} (${na(momento.porcentaje)})` : '';
                    md += `| ${t} | ${m} | ${na(tipo.nombre)} | ${na(tipo.porcentaje)} |\n`;
                });
            });
        });
        const total = evalTable.reduce((s,t)=>s+(parseFloat(t.porcentaje)||0),0);
        md += `\n**Total nota final:** ${total}%${Math.abs(total-100)<0.01 ? ' ✓ Correcto' : ' ⚠️ No suma 100%'}\n`;
    } else { md += `_Sin tabla de evaluación configurada._\n`; }

    // 7. Cronograma
    md += `\n# Cronograma\n\n`;
    md += `## Distribución semanal de temas\n\n`;
    if (topics.length) {
        md += `| Tema / Unidad | Semana | Fecha(s) | Observaciones |\n|---|---|---|---|\n`;
        md += topics.map(t => {
            const e = cronograma.find(c=>c.topicId===t.id)||{};
            return `| ${na(t.topic)} | ${na(e.semana)} | ${na(e.fechas)} | ${na(e.observaciones)} |`;
        }).join(nl) + nl;
    } else { md += `_Sin temas para distribuir._\n`; }
    md += `\n## Distribución semanal de rotaciones\n\n`;
    if (rotaciones.length) {
        md += `| Rotación / Servicio | Semana | Fecha(s) | Observaciones |\n|---|---|---|---|\n`;
        md += rotaciones.map(r => `| ${na(r.servicio)} | ${na(r.semana)} | ${na(r.fechas)} | ${na(r.observaciones)} |`).join(nl) + nl;
    } else { md += `_Sin rotaciones registradas._\n`; }

    // 8. Referencias
    md += `\n# Referencias\n\n`;
    const refs = [...new Set(topics.map(t=>(t.bibliography||'').trim()).filter(Boolean))];
    if (refs.length) {
        md += refs.map((r,i)=>`${i+1}. ${r}`).join(nl) + nl;
    } else { md += `_Sin referencias bibliográficas registradas._\n`; }

    return md;
}

function buildRmdContent(fd, realName, realModule, prereqItems) {
    const id = fd.identification || {};
    const header = `---
title: "${realName}"
subtitle: "Microcurrículo de asignatura"
author: "${id.coordinator || 'Universidad del Cauca'}"
date: "${new Date().toLocaleDateString('es-CO',{year:'numeric',month:'long',day:'numeric'})}"
output:
  bookdown::gitbook:
    split_by: none
    number_sections: no
    config:
      toc:
        collapse: subsection
  bookdown::pdf_book:
    keep_tex: false
    number_sections: no
description: |
  Microcurrículo — Programa de Medicina, Universidad del Cauca.
  Código: ${id.subjectCode || ''}, Semestre ${id.semester || ''}.
---

`;
    const body = buildMarkdownBody(fd, realName, realModule, prereqItems);
    return header + body;
}

function buildQmdContent(fd, realName, realModule, prereqItems) {
    const id = fd.identification || {};
    const pres = fd.presentation || {};
    const comp = fd.competencies || {};
    const matrix = comp.matrix || [];
    const topics = fd.methodology || [];
    const cronograma = fd.cronograma || [];
    const rotaciones = fd.rotaciones || [];
    const teachers = fd.teachers || [];
    const evalTable = fd.evaluationTable || [];
    const esc = s => (s||'').toString().replace(/\|/g,'\\|').replace(/\n/g,' ');
    const na = v => (v && v !== '—') ? esc(v) : '—';
    const nl = '\n';

    // ── YAML front matter ──────────────────────────────────────
    let qmd = `---
title: "${(realName||'Sin título').replace(/"/g,"'")}"
subtitle: "Microcurrículo de asignatura · Programa de Medicina"
author: "${(id.coordinator || 'Universidad del Cauca').replace(/"/g,"'")}"
date: "${new Date().toLocaleDateString('es-CO',{year:'numeric',month:'long',day:'numeric'})}"
lang: es
number-sections: false
format:
  html:
    toc: true
    toc-depth: 3
    toc-location: left
    toc-title: "Contenido"
    theme: cosmo
    smooth-scroll: true
    df-print: kable
    code-tools: false
  pdf:
    documentclass: article
    toc: true
    toc-title: "Contenido"
    colorlinks: true
    linkcolor: "006699"
    urlcolor: "006699"
    geometry:
      - top=2.5cm
      - right=2cm
      - bottom=2.5cm
      - left=2cm
    include-in-header:
      text: |
        \\usepackage{booktabs}
        \\usepackage{longtable}
        \\usepackage{array}
        \\usepackage{multirow}
execute:
  echo: false
  warning: false
---

`;

    // ── 1. Identificación ──────────────────────────────────────
    qmd += `# Identificación {#sec-identificacion}\n\n`;
    qmd += `## Datos de identificación {.unnumbered}\n\n`;
    qmd += `:::: {.columns}\n\n`;
    qmd += `::: {.column width="50%"}\n`;
    qmd += `| Campo | Valor |\n|:---|:---|\n`;
    qmd += `| **Nombre** | ${na(realName)} |\n`;
    qmd += `| **Código** | ${na(id.subjectCode)} |\n`;
    qmd += `| **Semestre** | ${na(id.semester)} |\n`;
    qmd += `:::\n\n`;
    qmd += `::: {.column width="50%"}\n`;
    qmd += `| Campo | Valor |\n|:---|:---|\n`;
    qmd += `| **Créditos** | ${na(id.credits)} |\n`;
    qmd += `| **Horas docencia/sem** | ${na(id.directTeachingHours||id.hoursPerWeek)} |\n`;
    qmd += `| **Módulo** | ${na(realModule)} |\n`;
    qmd += `:::\n\n`;
    qmd += `::::\n\n`;

    qmd += `## Prerrequisitos {.unnumbered}\n\n`;
    if (prereqItems.length) {
        prereqItems.forEach(p => { qmd += `- ${p}\n`; });
        qmd += '\n';
    } else {
        qmd += `::: {.callout-note appearance="minimal"}\nSin prerrequisitos definidos para esta asignatura.\n:::\n\n`;
    }

    // ── 2. Profesores ──────────────────────────────────────────
    qmd += `# Profesores {#sec-profesores}\n\n`;
    qmd += `## Coordinador {.unnumbered}\n\n`;
    if (id.coordinator) {
        qmd += `| Campo | Valor |\n|:---|:---|\n`;
        qmd += `| **Nombre** | ${esc(id.coordinator)} |\n`;
        qmd += `| **Email** | ${na(id.coordinatorEmail)} |\n`;
        qmd += `| **Perfil profesional** | ${na(id.coordinatorArea)} |\n\n`;
    } else {
        qmd += `::: {.callout-warning appearance="minimal"}\nNo hay coordinador registrado.\n:::\n\n`;
    }
    qmd += `## Cuerpo docente {.unnumbered}\n\n`;
    if (teachers.length) {
        qmd += `| Nombre | Email | Perfil profesional |\n|:---|:---|:---|\n`;
        teachers.forEach(t => { qmd += `| ${na(t.name)} | ${na(t.email)} | ${na(t.area)} |\n`; });
        qmd += `\n: Cuerpo docente {#tbl-docentes}\n\n`;
    } else {
        qmd += `::: {.callout-note appearance="minimal"}\nSin docentes registrados.\n:::\n\n`;
    }

    // ── 3. Presentación ────────────────────────────────────────
    qmd += `# Presentación {#sec-presentacion}\n\n`;
    const qmdPresFields = [
        ['Presentación de la Asignatura', pres.departmentMission],
        ['Objetivo General', pres.generalObjectives],
        ['Objetivos Específicos', pres.specificObjectives],
        ['Justificación de la Asignatura', pres.justification],
        ['Descripción General de la Asignatura', pres.generalDescription],
        ['Espacios de Asesorías', pres.advisorySpaces],
    ];
    const hasPres = qmdPresFields.some(([,v]) => v);
    if (hasPres) {
        qmdPresFields.forEach(([label, val]) => {
            if (val) qmd += `## ${label} {.unnumbered}\n\n${val}\n\n`;
        });
    } else {
        qmd += `::: {.callout-note appearance="minimal"}\nSin información de presentación registrada.\n:::\n\n`;
    }

    // ── 4. Competencias ────────────────────────────────────────
    qmd += `# Competencias {#sec-competencias}\n\n`;
    qmd += `## Matriz de competencias {.unnumbered}\n\n`;
    if (matrix.length) {
        qmd += `| # | Módulo | Competencia | Resultado de Aprendizaje | Estrategia Metodológica | Estrategia Evaluativa | Indicador |\n`;
        qmd += `|:--|:--|:--|:--|:--|:--|:--|\n`;
        matrix.forEach((m, i) => {
            qmd += `| ${i+1} | ${na(m.modulo)} | ${na(m.competencia)} | ${na(m.ra)} | ${na(m.estrategiaMet)} | ${na(m.estrategiaEval)} | ${na(m.indicador)} |\n`;
        });
        qmd += `\n: Matriz de competencias de la asignatura {#tbl-competencias .striped .hover}\n\n`;
    } else {
        qmd += `::: {.callout-warning}\nLa matriz de competencias no ha sido configurada.\n:::\n\n`;
    }

    // ── 5. Metodología ─────────────────────────────────────────
    qmd += `# Metodología y Contenidos {#sec-metodologia}\n\n`;
    qmd += `## Temas y estrategias pedagógicas {.unnumbered}\n\n`;
    if (topics.length) {
        qmd += `| # | Tema / Unidad | Estrategia(s) | Trabajo independiente | Bibliografía |\n`;
        qmd += `|:--|:--|:--|:--|:--|\n`;
        topics.forEach((t, i) => {
            const strats = Array.isArray(t.strategies) ? t.strategies.join(', ') : (t.strategy||'');
            qmd += `| ${i+1} | ${na(t.topic)} | ${na(strats)} | ${na(t.independent)} | ${na(t.bibliography)} |\n`;
        });
        qmd += `\n: Temas y estrategias pedagógicas {#tbl-temas .striped .hover}\n\n`;
    } else {
        qmd += `::: {.callout-note appearance="minimal"}\nSin temas registrados.\n:::\n\n`;
    }

    // ── 6. Sistema de Evaluación ───────────────────────────────
    qmd += `# Sistema de Evaluación {#sec-evaluacion}\n\n`;
    qmd += `## Proceso de evaluación {.unnumbered}\n\n`;
    if (fd.evaluation?.diagnostic) {
        qmd += `${fd.evaluation.diagnostic}\n\n`;
    } else {
        qmd += `::: {.callout-note appearance="minimal"}\nSin descripción del proceso evaluativo.\n:::\n\n`;
    }
    qmd += `## Tabla de calificación {.unnumbered}\n\n`;
    if (evalTable.length) {
        qmd += `::: {.panel-tabset}\n\n`;
        qmd += `### Tabla completa\n\n`;
        qmd += `| Tiempo evaluativo | Momento | Tipo de evaluación | % |\n|:--|:--|:--|--:|\n`;
        evalTable.forEach(tiempo => {
            tiempo.momentos?.forEach(momento => {
                momento.tipos?.forEach((tipo, ti) => {
                    const t = ti === 0 && tiempo.momentos[0] === momento ? `**${esc(tiempo.nombre||'')}** (${esc(tiempo.porcentaje||'')})` : '';
                    const m = ti === 0 ? `${esc(momento.nombre||'')} (${esc(momento.porcentaje||'')})` : '';
                    qmd += `| ${t} | ${m} | ${na(tipo.nombre)} | ${na(tipo.porcentaje)} |\n`;
                });
            });
        });
        qmd += `\n: Tabla de calificación {#tbl-evaluacion .striped}\n\n`;
        qmd += `### Por tiempo evaluativo\n\n`;
        evalTable.forEach(tiempo => {
            if (!tiempo.nombre) return;
            qmd += `**${esc(tiempo.nombre)}** — ${esc(tiempo.porcentaje||'')}%\n\n`;
            tiempo.momentos?.forEach(momento => {
                const tipos = momento.tipos?.map(t => `${esc(t.nombre||'')} ${esc(t.porcentaje||'')}%`).join(', ') || '—';
                qmd += `- *${esc(momento.nombre||'')}* (${esc(momento.porcentaje||'')}%): ${tipos}\n`;
            });
            qmd += '\n';
        });
        qmd += `:::\n\n`;
        const total = evalTable.reduce((s,t)=>s+(parseFloat(t.porcentaje)||0),0);
        if (Math.abs(total-100)<0.01) {
            qmd += `::: {.callout-tip}\n**Total nota final: ${total}%** ✓ La calificación suma correctamente el 100%.\n:::\n\n`;
        } else {
            qmd += `::: {.callout-warning}\n**Total nota final: ${total}%** ⚠️ La calificación no suma 100%. Revise la distribución de porcentajes.\n:::\n\n`;
        }
    } else {
        qmd += `::: {.callout-note appearance="minimal"}\nSin tabla de evaluación configurada.\n:::\n\n`;
    }

    // ── 7. Cronograma ──────────────────────────────────────────
    qmd += `# Cronograma {#sec-cronograma}\n\n`;
    qmd += `## Distribución semanal de temas {.unnumbered}\n\n`;
    if (topics.length) {
        qmd += `| Tema / Unidad | Semana | Fecha(s) | Observaciones |\n|:--|:--:|:--|:--|\n`;
        topics.forEach(t => {
            const e = cronograma.find(c=>c.topicId===t.id)||{};
            qmd += `| ${na(t.topic)} | ${na(e.semana)} | ${na(e.fechas)} | ${na(e.observaciones)} |\n`;
        });
        qmd += `\n: Distribución semanal de temas {#tbl-cronograma .striped}\n\n`;
    } else {
        qmd += `::: {.callout-note appearance="minimal"}\nSin temas para el cronograma.\n:::\n\n`;
    }
    if (rotaciones.length) {
        qmd += `## Distribución de rotaciones {.unnumbered}\n\n`;
        qmd += `| Rotación / Servicio | Semana | Fecha(s) | Observaciones |\n|:--|:--:|:--|:--|\n`;
        rotaciones.forEach(r => {
            qmd += `| ${na(r.servicio)} | ${na(r.semana)} | ${na(r.fechas)} | ${na(r.observaciones)} |\n`;
        });
        qmd += `\n: Distribución de rotaciones clínicas {#tbl-rotaciones .striped}\n\n`;
    }

    // ── 8. Referencias ─────────────────────────────────────────
    qmd += `# Referencias {#sec-referencias .unnumbered}\n\n`;
    const refs = [...new Set(topics.map(t=>(t.bibliography||'').trim()).filter(Boolean))];
    if (refs.length) {
        refs.forEach((r, i) => { qmd += `${i+1}. ${r}\n`; });
        qmd += '\n';
    } else {
        qmd += `::: {.callout-note appearance="minimal"}\nSin referencias bibliográficas registradas en los temas.\n:::\n`;
    }

    return qmd;
}

// ── Export Functions ─────────────────────────────────────
function exportPDF() {
    collectFormData();
    if (!formData.identification?.subjectCode) {
        showAlert('Selecciona una asignatura primero', 'error');
        return;
    }
    // Ensure preview is generated
    generatePreview();
    const previewHtml = document.getElementById('previewContent')?.innerHTML || '';
    const { realName } = getExportMeta();

    const printWindow = window.open('', '', 'height=900,width=800');
    printWindow.document.write(`<!DOCTYPE html><html lang="es"><head>
        <meta charset="UTF-8">
        <title>Microcurrículo — ${realName}</title>
        <style>
            @page { size: A4 portrait; margin: 1.8cm 2cm; }
            * { box-sizing: border-box; }
            body { margin: 0; padding: 0; background: white; width: 100%; }
            .bk-sidebar { display: none !important; }
            .bk-layout { display: block !important; width: 100% !important; }
            .bk-main { padding: 0; width: 100% !important; max-width: 100% !important; }
            .bk-cover { text-align: center; padding: 20px 0 30px; }
            .bk-chapter { font-size: 18px; }
            .bk-section { font-size: 14px; }
            .bk-table { width: 100%; font-size: 11px; }
            .bk-table th, .bk-table td { padding: 5px 7px; }
            .bk-dl { grid-template-columns: 180px 1fr; font-size: 12px; }
            .bk-text { font-size: 12px; }
            .bk-footer { font-size: 10px; }
            img { max-width: 100%; }
            @media print {
                body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .bk-table-wrap { overflow: visible; }
            }
        </style>
    </head><body>${previewHtml}
    <script>setTimeout(()=>{ window.print(); setTimeout(()=>window.close(),600); }, 900);<\/script>
    </body></html>`);
    printWindow.document.close();
    showAlert('Ventana de impresión abierta', 'success');
}

function exportMarkdown() {
    collectFormData();
    if (!formData.identification?.subjectCode) {
        showAlert('Selecciona una asignatura primero', 'error');
        return;
    }
    const { realName, realModule, prereqItems } = getExportMeta();
    const cover = `# ${realName}\n\n> Microcurrículo de asignatura — Universidad del Cauca, Programa de Medicina  \n> Código: ${formData.identification.subjectCode} · Semestre ${formData.identification.semester || '—'} · ${new Date().toLocaleDateString('es-CO',{year:'numeric',month:'long',day:'numeric'})}\n\n---\n\n`;
    const content = cover + buildMarkdownBody(formData, realName, realModule, prereqItems);
    downloadFile(content, `${formData.identification.subjectCode}_microcurriculo.md`, 'text/markdown');
    showAlert('Markdown descargado', 'success');
}

function exportJSON() {
    collectFormData();
    if (!formData.identification?.subjectCode) {
        showAlert('Selecciona una asignatura primero', 'error');
        return;
    }
    const { realName } = getExportMeta();
    const exportObj = { ...formData, _meta: { exportDate: new Date().toISOString(), realName } };
    downloadFile(JSON.stringify(exportObj, null, 2), `${formData.identification.subjectCode}_microcurriculo.json`, 'application/json');
    showAlert('JSON guardado', 'success');
}

function exportRMarkdown() {
    collectFormData();
    if (!formData.identification?.subjectCode) {
        showAlert('Selecciona una asignatura primero', 'error');
        return;
    }
    const { realName, realModule, prereqItems } = getExportMeta();
    const content = buildRmdContent(formData, realName, realModule, prereqItems);
    downloadFile(content, `${formData.identification.subjectCode}_microcurriculo.Rmd`, 'text/plain');
    showAlert('R Markdown (.Rmd) descargado', 'success');
}

function exportAllRMarkdown() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('microcullo_subject_'));
    if (keys.length === 0) {
        showAlert('No hay microcurrículos guardados', 'error');
        return;
    }

    let combined = `---
title: "Microcurrículos — Programa de Medicina"
subtitle: "Universidad del Cauca"
date: "${new Date().toLocaleDateString('es-CO',{year:'numeric',month:'long',day:'numeric'})}"
output:
  bookdown::gitbook:
    split_by: chapter
    config:
      toc:
        collapse: subsection
---

`;
    let count = 0;
    keys.forEach(key => {
        try {
            const fd = JSON.parse(localStorage.getItem(key));
            if (!fd?.identification?.subjectCode) return;
            const id = fd.identification;
            const subjectSelect = document.getElementById('subjectName');
            let realName = id.subjectName || id.subjectCode;
            // Try to find real name from dropdown options
            if (subjectSelect) {
                const opt = Array.from(subjectSelect.options).find(o => o.value === id.subjectCode);
                if (opt?.dataset?.subjectData) {
                    try { realName = JSON.parse(opt.dataset.subjectData).name || realName; } catch(e) {}
                }
            }
            const realModule = id.component || id.module || '';
            const prereqItems = (id.prerequisites || []).map(code => {
                const el = document.getElementById(`prereq_${code}`)?.parentElement?.querySelector('span');
                return el?.textContent?.trim() ? `${code} — ${el.textContent.trim()}` : code;
            });

            combined += `\n\n---\n\n# ${realName} (${id.subjectCode})\n\n`;
            combined += buildMarkdownBody(fd, realName, realModule, prereqItems);
            count++;
        } catch(e) { /* skip corrupt entries */ }
    });

    if (count === 0) {
        showAlert('No se encontraron microcurrículos con datos', 'error');
        return;
    }
    downloadFile(combined, `microcurriculos_medicina_${new Date().toISOString().slice(0,10)}.Rmd`, 'text/plain');
    showAlert(`✅ ${count} microcurrículo(s) exportados en un solo .Rmd`, 'success');
}

function exportQuarto() {
    collectFormData();
    if (!formData.identification?.subjectCode) {
        showAlert('Selecciona una asignatura primero', 'error');
        return;
    }
    const { realName, realModule, prereqItems } = getExportMeta();
    const content = buildQmdContent(formData, realName, realModule, prereqItems);
    downloadFile(content, `${formData.identification.subjectCode}_microcurriculo.qmd`, 'text/plain');
    showAlert('Quarto Markdown (.qmd) descargado', 'success');
}

function loadJSZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        script.crossOrigin = 'anonymous';
        script.onload = () => resolve(window.JSZip);
        script.onerror = () => reject(new Error('No se pudo cargar JSZip'));
        document.head.appendChild(script);
    });
}

async function exportAllQuarto() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('microcullo_subject_'));
    if (keys.length === 0) {
        showAlert('No hay microcurrículos guardados', 'error');
        return;
    }
    showAlert('Preparando libro Quarto...', 'info');
    let JSZip;
    try {
        JSZip = await loadJSZip();
    } catch(e) {
        showAlert('Error al cargar JSZip — verifica tu conexión a internet', 'error');
        return;
    }

    const zip = new JSZip();
    const bookFolder = zip.folder('microcurriculos_medicina');
    const chapterFiles = [];
    let count = 0;
    const subjectSelect = document.getElementById('subjectName');

    keys.sort().forEach(key => {
        try {
            const fd = JSON.parse(localStorage.getItem(key));
            if (!fd?.identification?.subjectCode) return;
            const id = fd.identification;
            let realName = id.subjectName || id.subjectCode;
            if (subjectSelect) {
                const opt = Array.from(subjectSelect.options).find(o => o.value === id.subjectCode);
                if (opt?.dataset?.subjectData) {
                    try { realName = JSON.parse(opt.dataset.subjectData).name || realName; } catch(_) {}
                }
            }
            const realModule = id.component || id.module || '';
            const prereqItems = (id.prerequisites || []).map(code => {
                const el = document.getElementById(`prereq_${code}`)?.parentElement?.querySelector('span');
                return el?.textContent?.trim() ? `${code} — ${el.textContent.trim()}` : code;
            });
            const filename = `${id.subjectCode}.qmd`;
            bookFolder.file(filename, buildQmdContent(fd, realName, realModule, prereqItems));
            chapterFiles.push(filename);
            count++;
        } catch(_) {}
    });

    if (count === 0) {
        showAlert('No se encontraron microcurrículos con datos', 'error');
        return;
    }

    const dateStr = new Date().toLocaleDateString('es-CO',{year:'numeric',month:'long',day:'numeric'});

    const quartoYml = `project:\n  type: book\n  output-dir: _book\n\nbook:\n  title: "Microcurrículos — Programa de Medicina"\n  subtitle: "Universidad del Cauca"\n  date: "${dateStr}"\n  language: es\n  author:\n    - name: "Programa de Medicina"\n      affiliation: "Universidad del Cauca"\n  chapters:\n    - index.qmd\n${chapterFiles.map(f=>`    - ${f}`).join('\n')}\n\nbibliography: references.bib\n\nformat:\n  html:\n    theme: cosmo\n    toc: true\n    toc-depth: 3\n    smooth-scroll: true\n    number-sections: false\n    df-print: kable\n  pdf:\n    documentclass: book\n    toc: true\n    number-sections: false\n    colorlinks: true\n    geometry:\n      - top=2.5cm\n      - right=2cm\n      - bottom=2.5cm\n      - left=2cm\n    include-in-header:\n      text: |\n        \\\\usepackage{booktabs}\n        \\\\usepackage{longtable}\n\nexecute:\n  echo: false\n  warning: false\n  message: false\n\nlang: es\n`;
    bookFolder.file('_quarto.yml', quartoYml);

    const indexQmd = `---\ntitle: "Presentación del Programa"\n---\n\n# Prefacio {.unnumbered}\n\nEste documento recopila los microcurrículos del **Programa de Medicina**, Universidad del Cauca.\nGenerado con **MicroApp** el ${dateStr}.\n\n## Asignaturas incluidas {.unnumbered}\n\n${chapterFiles.map((f,i)=>`${i+1}. ${f.replace('.qmd','')}`).join('\n')}\n\n## Cómo renderizar {.unnumbered}\n\n::: {.callout-tip}\nPara generar este libro con Quarto:\n\n\`\`\`bash\n# Requiere Quarto instalado: https://quarto.org\nquarto render\n\`\`\`\n\nO desde RStudio: **Build > Render Book**\n:::\n`;
    bookFolder.file('index.qmd', indexQmd);
    bookFolder.file('references.bib', '% Bibliografía BibTeX — completar según sea necesario\n');

    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `microcurriculos_quarto_${new Date().toISOString().slice(0,10)}.zip`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
    showAlert(`✅ Libro Quarto con ${count} capítulo(s) descargado (.zip)`, 'success');
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

let _supabaseAutosaveTimer = null;
function scheduleSupabaseAutosave() {
    if (!supabaseReady) return;
    clearTimeout(_supabaseAutosaveTimer);
    _supabaseAutosaveTimer = setTimeout(syncAutosaveToSupabase, 3000);
}

async function syncAutosaveToSupabase() {
    if (!supabaseReady) return;
    const code = formData.identification?.subjectCode;
    if (!code) return;
    try {
        const { data: existing } = await supabase
            .from('microapp_data').select('id')
            .eq('subject_code', code).eq('data_type', 'autosave').limit(1);

        if (existing?.[0]?.id) {
            const { error: upErr } = await supabase.from('microapp_data')
                .update({ data: formData, updated_at: new Date().toISOString() }).eq('id', existing[0].id);
            if (upErr) console.error('Autosave update error:', upErr.message);
        } else {
            const { error: insErr } = await supabase.from('microapp_data')
                .insert({ subject_code: code, data_type: 'autosave', version_name: 'Autoguardado', data: formData });
            if (insErr) console.error('Autosave insert error:', insErr.message);
        }
        const dot2 = document.getElementById('syncDot');
        if (dot2) { dot2.style.background = '#4ade80'; setTimeout(() => dot2.style.background = '', 2000); }
    } catch(e) {
        console.error('syncAutosaveToSupabase error:', e.message);
    }
}

async function forceSyncToSupabase() {
    if (!supabaseReady) {
        showAlert('Supabase no está conectado — verifica el punto de estado en el encabezado', 'error');
        return;
    }
    collectFormData();
    const code = formData.identification?.subjectCode;
    if (!code) { showAlert('Selecciona una asignatura primero', 'error'); return; }

    const btn = document.getElementById('forceSyncBtn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Sincronizando...'; }

    try {
        // 1. Guardar estado actual como autosave
        let autosaveOk = false;
        const { data: exAS } = await supabase.from('microapp_data')
            .select('id').eq('subject_code', code).eq('data_type', 'autosave').limit(1);
        if (exAS?.[0]?.id) {
            const { error: e } = await supabase.from('microapp_data')
                .update({ data: formData, updated_at: new Date().toISOString() }).eq('id', exAS[0].id);
            autosaveOk = !e;
            if (e) console.error('Autosave update:', e.message);
        } else {
            const { error: e } = await supabase.from('microapp_data')
                .insert({ subject_code: code, data_type: 'autosave', version_name: 'Autoguardado', data: formData });
            autosaveOk = !e;
            if (e) console.error('Autosave insert:', e.message);
        }

        // 2. Subir versiones locales que no estén en Supabase
        const vKey = `microapp_versions_${code}`;
        let localVersions = [];
        try { localVersions = JSON.parse(localStorage.getItem(vKey) || '[]'); } catch(_) {}
        let synced = 0, skipped = 0;
        for (const v of localVersions) {
            if (v.sbId) { skipped++; continue; }
            const { data: sbV, error: vErr } = await supabase.from('microapp_data')
                .insert({ subject_code: code, data_type: 'version', version_name: v.name, data: v.data })
                .select('id').single();
            if (!vErr && sbV?.id) { v.sbId = sbV.id; v.source = 'supabase'; synced++; }
            else if (vErr) console.error('Version sync error:', vErr.message);
        }
        if (synced > 0) localStorage.setItem(vKey, JSON.stringify(localVersions));

        const msg = [
            autosaveOk ? '✅ Estado actual subido ☁️' : '⚠️ Error subiendo estado actual (ver consola)',
            synced > 0 ? `${synced} versión(es) nueva(s) subida(s) ☁️` : '',
            skipped > 0 ? `${skipped} versión(es) ya estaban en Supabase` : ''
        ].filter(Boolean).join(' · ');
        showAlert(msg, autosaveOk ? 'success' : 'warning');
        renderSavedVersions();
    } catch(e) {
        showAlert(`Error de sincronización: ${e.message}`, 'error');
        console.error('forceSyncToSupabase error:', e);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '☁️ Subir a Supabase'; }
    }
}

function saveLocalStorageSilent() {
    localStorage.setItem('microculloData', JSON.stringify(formData));
    const code = formData.identification?.subjectCode;
    if (code) localStorage.setItem(`microcullo_subject_${code}`, JSON.stringify(formData));
    scheduleSupabaseAutosave();

    const dot = document.getElementById('saveDot');
    const text = document.getElementById('saveText');
    if (dot) dot.style.background = '#4ade80';
    if (text) text.textContent = 'Guardado';
    clearTimeout(window._saveTimer);
    window._saveTimer = setTimeout(() => {
        if (dot) dot.style.background = 'transparent';
        if (text) text.textContent = '';
    }, 2500);
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
    document.getElementById('subjectName').value = formData.identification?.subjectCode || '';
    document.getElementById('subjectCode').value = formData.identification?.subjectCode || '';
    document.getElementById('semester').value = formData.identification?.semester || '';
    document.getElementById('credits').value = formData.identification?.credits || '';
    document.getElementById('hoursPerWeek').value = formData.identification?.hoursPerWeek || formData.identification?.directTeachingHours || '';
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
        renderRotaciones();
    }
    document.getElementById('advisorySpaces').value = formData.presentation?.advisorySpaces || '';

    // Load competencies matrix
    renderCompetenciesMatrix();

    document.getElementById('diagnosticEvaluation').value = formData.evaluation?.diagnostic || '';
    document.getElementById('evaluationDetails').value = formData.evaluation?.details || '';
    renderEvaluationTable();

    renderMallaHoraria();
    renderEvaluationTable();
    // Resolve real name from SELECT option (subjectName field stores code after reload)
    const _sel = document.getElementById('subjectName');
    const _opt = _sel?.options[_sel.selectedIndex];
    const _sj  = _opt?.dataset?.subjectData ? JSON.parse(_opt.dataset.subjectData) : null;
    updateHeaderSubjectName(_sj?.name || formData.identification?.subjectName || '');
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
            rotaciones: [],
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
        renderRotaciones();
        renderMallaHoraria();
        renderEvaluationTable();
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
async function loadSubjectDetails() {
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
                // Merge: keep user-editable saved fields (coordinator, prereqs, etc.)
                // but overwrite protected academic fields with latest from JSON
                formData.identification = { ...formData.identification, ...freshIdentification };
                loadFormFromData();
                showAlert(`✅ ${subject.code} — datos previos restaurados`, 'success');
            } catch (e) {
                resetSubjectForm(freshIdentification);
                showAlert(`✅ Detalles de ${subject.code} cargados`, 'success');
            }
        } else {
            // Sin datos locales — intentar restaurar desde Supabase
            let restoredFromCloud = false;
            if (supabaseReady) {
                try {
                    const { data: sbRows } = await supabase.from('microapp_data')
                        .select('id, data, data_type, created_at')
                        .eq('subject_code', subject.code)
                        .order('created_at', { ascending: false })
                        .limit(10);
                    // Preferir autosave; si no, la entrada más reciente
                    const best = sbRows?.find(v => v.data_type === 'autosave') || sbRows?.[0];
                    if (best?.data) {
                        formData = best.data;
                        formData.identification = { ...formData.identification, ...freshIdentification };
                        loadFormFromData();
                        localStorage.setItem(`microcullo_subject_${subject.code}`, JSON.stringify(formData));
                        showAlert(`✅ ${subject.code} — datos restaurados desde Supabase ☁️`, 'success');
                        restoredFromCloud = true;
                    }
                } catch(e) { console.warn('No se pudo cargar desde Supabase:', e.message); }
            }
            if (!restoredFromCloud) {
                resetSubjectForm(freshIdentification);
                showAlert(`✅ Detalles de ${subject.code} cargados (formulario nuevo)`, 'success');
            }
        }

        updateHeaderSubjectName(subject.name);
        updateStats();
        renderMallaHoraria();
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
    const estrategiaMet = Array.from(document.querySelectorAll('.comp-estrategia-checkbox:checked')).map(cb => cb.value).join(', ');
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
    document.querySelectorAll('.comp-estrategia-checkbox:checked').forEach(cb => cb.checked = false);
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
    const checkedStrats = Array.from(document.querySelectorAll('.comp-estrategia-checkbox:checked'));
    const estrategiaMet = checkedStrats.map(cb => cb.value).join(', ');
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
    document.querySelectorAll('.comp-estrategia-checkbox:checked').forEach(cb => cb.checked = false);
    document.getElementById('compEstrategiaEval').value = '';
    document.getElementById('compIndicador').value = '';
    window.currentCompetencia = null;

    showAlert('Competencia(s) agregada(s) correctamente', 'success');
    saveLocalStorage();
}

// ============================================
// VERSIONS MANAGEMENT
// ============================================

async function saveCompleteVersion() {
    collectFormData();

    const subjectCode = formData.identification?.subjectCode;
    if (!subjectCode) {
        showAlert('Selecciona una asignatura antes de guardar una versión', 'error');
        return;
    }

    const versionName = prompt('Nombre de la versión (ej: v1.0 - Propuesta inicial):');
    if (!versionName) return;

    const nowStr = new Date().toLocaleString('es-CO');
    const localId = Date.now();
    const entry = {
        id: localId,
        name: versionName,
        date: nowStr,
        data: JSON.parse(JSON.stringify(formData)),
        source: 'local'
    };

    // 1. Guardar siempre en localStorage como respaldo inmediato
    const vKey = `microapp_versions_${subjectCode}`;
    let localVersions = [];
    try { localVersions = JSON.parse(localStorage.getItem(vKey) || '[]'); } catch(e) {}
    localVersions.push(entry);
    localStorage.setItem(vKey, JSON.stringify(localVersions));

    if (!supabaseReady) {
        showAlert(`✅ Versión "${versionName}" guardada localmente`, 'success');
        return;
    }

    // 2. Intentar guardar en Supabase
    try {
        const { data: sbV, error: vErr } = await supabase.from('microapp_data')
            .insert({ subject_code: subjectCode, data_type: 'version', version_name: versionName, data: formData })
            .select('id').single();
        if (vErr) throw vErr;

        entry.sbId = sbV.id;
        entry.source = 'supabase';
        localVersions[localVersions.length - 1] = entry;
        localStorage.setItem(vKey, JSON.stringify(localVersions));
        showAlert(`✅ Versión "${versionName}" guardada en Supabase ☁️ y localmente`, 'success');

    } catch(err) {
        console.error('Error al guardar versión en Supabase:', err);
        showAlert(`✅ Guardada localmente. Error Supabase: ${err.message}`, 'warning');
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
        renderCompStrategiesCheckboxes();
        renderMethodStrategyCheckboxes();
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

function buildStrategyCheckboxList(container, cssClass) {
    container.innerHTML = '';
    if (teachingStrategies.length === 0) {
        const p = document.createElement('p');
        p.style.cssText = 'color:#999;font-size:12px;margin:0;';
        p.textContent = 'No hay estrategias cargadas';
        container.appendChild(p);
        return;
    }
    teachingStrategies.forEach(s => {
        const label = document.createElement('label');
        label.style.cssText = 'display:flex;align-items:flex-start;gap:8px;cursor:pointer;padding:6px 8px;border-radius:4px;transition:background 0.15s;';
        label.onmouseover = function() { this.style.background = '#e8f0ff'; };
        label.onmouseout  = function() { this.style.background = 'transparent'; };

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = cssClass;
        cb.value = s.abbreviation;
        cb.style.cssText = 'margin-top:3px;accent-color:#1D5FA6;flex-shrink:0;cursor:pointer;';

        const span = document.createElement('span');
        span.style.cssText = 'font-size:12px;line-height:1.4;';
        span.innerHTML = `<strong style="color:#1D5FA6;">${s.abbreviation}</strong> — ${s.name}`;

        label.appendChild(cb);
        label.appendChild(span);
        container.appendChild(label);
    });
}

function renderCompStrategiesCheckboxes() {
    const container = document.getElementById('compEstrategiaMetContainer');
    if (!container) return;
    buildStrategyCheckboxList(container, 'comp-estrategia-checkbox');
}

function renderMethodStrategyCheckboxes() {
    const container = document.getElementById('methodStrategyContainer');
    if (!container) return;
    buildStrategyCheckboxList(container, 'method-estrategia-checkbox');
}

function populateStrategySelect() {
    const select = document.getElementById('methodStrategy');
    if (!select) return;
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
    renderCompStrategiesCheckboxes();
    renderMethodStrategyCheckboxes();
    showAlert(`✅ Estrategia "${name}" creada correctamente`, 'success');
}

function addMethodologyTopic() {
    const topic = document.getElementById('methodTopic').value.trim();
    const checkedStrats = Array.from(document.querySelectorAll('.method-estrategia-checkbox:checked'));
    const independent = document.getElementById('methodIndependent').value.trim();
    const bibliography = document.getElementById('methodBibliography').value.trim();

    if (!topic || checkedStrats.length === 0) {
        showAlert('Por favor completa Tema y selecciona al menos una Metodología', 'error');
        return;
    }

    const strategyStr = checkedStrats.map(cb => cb.value).join(', ');

    const newTopic = {
        id: Date.now(),
        topic,
        strategy: strategyStr,
        independent,
        bibliography
    };

    if (!formData.methodology) formData.methodology = [];
    formData.methodology.push(newTopic);
    methodologyTopics = formData.methodology;

    document.getElementById('methodTopic').value = '';
    document.querySelectorAll('.method-estrategia-checkbox:checked').forEach(cb => cb.checked = false);
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

    tbody.innerHTML = methodologyTopics.map(t => {
        const stratDisplay = typeof t.strategy === 'string'
            ? t.strategy
            : (t.strategy?.abbreviation ? `${t.strategy.abbreviation} — ${t.strategy.name}` : '—');
        return `
        <tr style="border-bottom: 1px solid #dce6ef; background: #fafbfc;">
            <td style="padding: 14px; font-size: 13px; color: #333;">${t.topic}</td>
            <td style="padding: 14px; font-size: 12px; color: #1D5FA6; font-weight: 600;">${stratDisplay}</td>
            <td style="padding: 14px; font-size: 12px; color: #555;">${t.independent || '—'}</td>
            <td style="padding: 14px; font-size: 12px; color: #555;">
                ${t.bibliography || '—'}
                <button onclick="deleteMethodologyTopic(${t.id})" style="background: #fee; color: #b02020; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; margin-top: 8px; display: block;">Eliminar</button>
            </td>
        </tr>`;
    }).join('');
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

async function loadPlanMedicina() {
    try {
        const response = await fetch('./plan_medicina_2026-06-17.json');
        if (!response.ok) throw new Error('HTTP ' + response.status);
        planMedicinaData = await response.json();
    } catch (error) {
        console.warn('Plan medicina no disponible:', error.message);
    }
}

function renderMallaHoraria() {
    const container = document.getElementById('mallaHorariaBody');
    if (!container) return;

    const id = formData.identification;
    if (!id?.subjectName) {
        container.innerHTML = '<p style="color:#999;font-size:13px;padding:20px;text-align:center;">Selecciona una asignatura para ver su malla horaria semanal.</p>';
        return;
    }

    if (!planMedicinaData) {
        container.innerHTML = '<p style="color:#999;font-size:13px;padding:20px;text-align:center;">Cargando datos del plan de estudios...</p>';
        return;
    }

    const semester = parseInt(id.semester) || 1;
    const semSchedule = planMedicinaData.mallaSchedule?.[String(semester)] || {};
    const allPlanSubjects = planMedicinaData.subjects || [];
    const semSubjects = allPlanSubjects.filter(s => s.sem === semester);
    const hourData = planMedicinaData.hourData || {};

    // Match current subject in plan by name
    const currentPlanSubject = allPlanSubjects.find(s =>
        s.name === id.subjectName ||
        id.subjectName?.toLowerCase().includes(s.name.toLowerCase()) ||
        s.name.toLowerCase().includes(id.subjectName?.toLowerCase())
    );
    const currentSubjectId = currentPlanSubject?.id;

    if (Object.keys(semSchedule).length === 0) {
        container.innerHTML = `<p style="color:#999;font-size:13px;padding:20px;text-align:center;">No hay malla horaria disponible para el semestre ${semester}.</p>`;
        return;
    }

    // Color palette per subject
    const palette = ['#1D5FA6','#2a9d8f','#e76f51','#6a4c93','#457b9d','#2d6a4f','#f4a261','#264653','#c77dff','#e9c46a'];
    const subjectColors = {};
    semSubjects.forEach((s, i) => { subjectColors[s.id] = palette[i % palette.length]; });

    // Short abbreviation: first 2 meaningful words, max 4 chars each
    function makeAbbrev(name) {
        const stop = new Set(['y','de','del','la','las','el','los','en','a','e','con','por','para','sin']);
        const words = name.split(/\s+/).filter(w => !stop.has(w.toLowerCase()) && w.length > 1);
        return words.length === 0 ? name.substring(0, 6)
            : words.slice(0, 2).map(w => w.substring(0, 5)).join(' ');
    }
    const subjectAbbrev = {};
    semSubjects.forEach(s => { subjectAbbrev[s.id] = makeAbbrev(s.name); });

    // Determine hour range from schedule data
    const usedHours = [...new Set(Object.keys(semSchedule).map(k => parseInt(k.split('-')[1])))].sort((a, b) => a - b);
    const minH = usedHours[0], maxH = usedHours[usedHours.length - 1];
    const allHours = [];
    for (let h = minH; h <= maxH; h++) allHours.push(h);

    const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];
    const dayLabels = { lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes' };

    let html = '<div style="overflow-x:auto;">';

    // Legend chips
    html += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;">';
    semSubjects.forEach(s => {
        const isCurrent = s.id === currentSubjectId;
        const color = subjectColors[s.id];
        const docSem = hourData[String(s.id)]?.docSem || '?';
        html += `<div style="display:flex;align-items:center;gap:6px;padding:5px 12px;border-radius:20px;
            background:${isCurrent ? color : color + '22'};
            border:${isCurrent ? '2px solid ' + color : '1px solid ' + color + '88'};
            font-size:11px;color:${isCurrent ? 'white' : color};font-weight:${isCurrent ? '700' : '500'};">
            ${s.name}&nbsp;<span style="opacity:0.8;">${docSem}h/sem</span>
            ${isCurrent ? '&nbsp;◀' : ''}
        </div>`;
    });
    html += '</div>';

    // Timetable
    html += `<table style="border-collapse:collapse;font-size:12px;width:100%;min-width:480px;">`;
    html += `<thead><tr>
        <th style="background:#1D5FA6;color:white;padding:7px 10px;border:1px solid #1557a0;font-size:11px;width:52px;">Hora</th>`;
    days.forEach(d => {
        html += `<th style="background:#1D5FA6;color:white;padding:7px 10px;border:1px solid #1557a0;font-size:12px;">${dayLabels[d]}</th>`;
    });
    html += `</tr></thead><tbody>`;

    allHours.forEach(hour => {
        html += `<tr>
            <td style="border:1px solid #dce6ef;padding:5px 8px;text-align:center;font-weight:600;font-size:11px;color:#5a6e85;background:#f0f4f8;white-space:nowrap;">${hour}:00</td>`;
        days.forEach(d => {
            const subIds = semSchedule[`${d}-${hour}`] || [];
            if (subIds.length === 0) {
                html += `<td style="border:1px solid #e8eef4;min-width:90px;background:#fafafa;"></td>`;
            } else {
                const chips = subIds.map(subId => {
                    const isCurrent = subId === currentSubjectId;
                    const color = subjectColors[subId] || '#999';
                    const abbrev = subjectAbbrev[subId] || 'ID:' + subId;
                    const subInfo = semSubjects.find(s => s.id === subId);
                    return `<div title="${subInfo?.name || 'ID:' + subId}"
                        style="background:${isCurrent ? color : color + '33'};
                               color:${isCurrent ? 'white' : color};
                               border:1px solid ${isCurrent ? color : color + '88'};
                               border-radius:4px;padding:3px 6px;font-size:11px;
                               font-weight:${isCurrent ? '700' : '500'};text-align:center;line-height:1.3;">
                        ${abbrev}
                    </div>`;
                }).join('');
                html += `<td style="border:1px solid #e8eef4;padding:3px;vertical-align:top;min-width:90px;">${chips}</td>`;
            }
        });
        html += '</tr>';
    });

    html += `</tbody></table>
    <p style="font-size:11px;color:#aaa;margin-top:8px;">ℹ️ Horario informativo. La asignación definitiva la coordina Registro Académico.</p>
    </div>`;

    container.innerHTML = html;
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
                    cells.push(`<td rowspan="${tiempoTotal}" style="${b} vertical-align:middle; text-align:center; background:${tiempoBg}; padding:8px 8px;">
                        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
                            <input type="text" value="${tiempo.nombre}"
                                   style="${inputBase} font-weight:700; font-size:13px; text-align:center;"
                                   ${inputFocus} saveEvalTiempo(${tiempo.id},'nombre',this.value)">
                            <div style="display:flex;align-items:center;gap:3px;">
                                <input type="text" value="${tiempo.porcentaje}"
                                       style="width:55px; border:1px solid #dce6ef; border-radius:4px; font-size:12px; font-weight:600; color:#1D5FA6; text-align:center; padding:4px 5px; background:transparent;"
                                       ${inputFocus} saveEvalTiempo(${tiempo.id},'porcentaje',this.value);"
                                       oninput="saveEvalTiempo(${tiempo.id},'porcentaje',this.value); updateEvalTotals();">
                                <button onclick="deleteEvalTiempo(${tiempo.id})"
                                        style="background:#fee8e8; color:#b02020; border:1px solid #f5b5b5; padding:3px 7px; border-radius:4px; font-size:13px; cursor:pointer; font-weight:600;" title="Eliminar tiempo">×</button>
                                <button onclick="addEvalMomento(${tiempo.id})"
                                        style="background:#e8f6ee; color:#1a7a4a; border:1px solid #a8d8a8; padding:3px 7px; border-radius:4px; font-size:13px; cursor:pointer; font-weight:600;" title="Agregar momento">＋</button>
                            </div>
                        </div>
                    </td>`);
                }

                if (tipoIdx === 0) {
                    cells.push(`<td rowspan="${mRows}" style="${b} vertical-align:middle; text-align:center; background:#f5f8fc; padding:8px 8px;">
                        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
                            <input type="text" value="${momento.nombre}"
                                   style="${inputBase} font-weight:600; font-size:13px; text-align:center;"
                                   ${inputFocus} saveEvalMomento(${tiempo.id},${momento.id},'nombre',this.value)">
                            <div style="display:flex;align-items:center;gap:3px;">
                                <input type="text" value="${momento.porcentaje}"
                                       style="width:55px; border:1px solid #dce6ef; border-radius:4px; font-size:12px; font-weight:600; color:#1D5FA6; text-align:center; padding:4px 5px; background:transparent;"
                                       ${inputFocus} saveEvalMomento(${tiempo.id},${momento.id},'porcentaje',this.value);"
                                       oninput="saveEvalMomento(${tiempo.id},${momento.id},'porcentaje',this.value); updateEvalTotals();">
                                <button onclick="deleteEvalMomento(${tiempo.id},${momento.id})"
                                        style="background:#fee8e8; color:#b02020; border:1px solid #f5b5b5; padding:3px 7px; border-radius:4px; font-size:13px; cursor:pointer; font-weight:600;" title="Eliminar momento">×</button>
                                <button onclick="addEvalTipo(${tiempo.id},${momento.id})"
                                        style="background:#e8f6ee; color:#1a7a4a; border:1px solid #a8d8a8; padding:3px 7px; border-radius:4px; font-size:13px; cursor:pointer; font-weight:600;" title="Agregar fila">＋</button>
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

        // Skip "Momentos de [tiempo]" row when there's only 1 momento — no distribution to validate
        if (t.momentos.length <= 1) return [tipoRows];

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

// ============================================
// ROTACIONES
// ============================================

function renderRotaciones() {
    const tbody = document.getElementById('rotacionesTableBody');
    if (!tbody) return;
    if (!formData.rotaciones) formData.rotaciones = [];

    if (formData.rotaciones.length === 0) {
        tbody.innerHTML = `<tr id="rotacionesEmpty">
            <td colspan="5" style="padding:30px; text-align:center; color:#999; font-size:13px;">
                Sin rotaciones registradas. Usa el botón para agregar.
            </td>
        </tr>`;
        return;
    }

    const inputStyle = 'width:100%; padding:7px 10px; border:1px solid #dce6ef; border-radius:6px; font-size:13px;';
    tbody.innerHTML = formData.rotaciones.map((r, idx) => {
        const rowBg = idx % 2 === 0 ? '#fafbfc' : 'white';
        return `<tr style="border-bottom:1px solid #dce6ef; background:${rowBg};">
            <td style="padding:8px 12px;">
                <input type="text" value="${r.servicio || ''}" placeholder="Nombre de la rotación / servicio"
                       style="${inputStyle} min-width:180px;"
                       onchange="saveRotacionField(${r.id},'servicio',this.value)">
            </td>
            <td style="padding:8px 12px; text-align:center;">
                <input type="number" min="1" max="20" value="${r.semana || ''}" placeholder="—"
                       style="width:62px; padding:7px; border:1px solid #dce6ef; border-radius:6px; font-size:13px; text-align:center;"
                       onchange="saveRotacionField(${r.id},'semana',this.value)">
            </td>
            <td style="padding:8px 12px;">
                <input type="text" value="${r.fechas || ''}" placeholder="Ej: 10/02 ó 10-14/02"
                       style="${inputStyle} min-width:140px;"
                       onchange="saveRotacionField(${r.id},'fechas',this.value)">
            </td>
            <td style="padding:8px 12px;">
                <input type="text" value="${r.observaciones || ''}" placeholder="Observaciones..."
                       style="${inputStyle} min-width:160px;"
                       onchange="saveRotacionField(${r.id},'observaciones',this.value)">
            </td>
            <td style="padding:8px 12px; text-align:center;">
                <button onclick="deleteRotacion(${r.id})"
                        style="background:#fee8e8; color:#b02020; border:1px solid #f5b5b5; padding:4px 9px; border-radius:4px; font-size:13px; cursor:pointer; font-weight:600;" title="Eliminar rotación">×</button>
            </td>
        </tr>`;
    }).join('');
}

function addRotacion() {
    if (!formData.rotaciones) formData.rotaciones = [];
    formData.rotaciones.push({ id: Date.now(), servicio: '', semana: '', fechas: '', observaciones: '' });
    renderRotaciones();
    saveLocalStorageSilent();
}

function deleteRotacion(id) {
    formData.rotaciones = (formData.rotaciones || []).filter(r => r.id !== id);
    renderRotaciones();
    saveLocalStorageSilent();
}

function saveRotacionField(id, field, value) {
    const r = (formData.rotaciones || []).find(r => r.id === id);
    if (r) { r[field] = value; saveLocalStorageSilent(); }
}

// ============================================
// VISTA PREVIA
// ============================================

function generatePreview() {
    const container = document.getElementById('previewContent');
    if (!container) return;
    collectFormData();

    const id = formData.identification;
    if (!id?.subjectCode) {
        container.innerHTML = '<p style="text-align:center;color:#999;padding:40px 0;">Selecciona una asignatura para ver la vista previa...</p>';
        return;
    }

    // Resolve real subject name (SELECT value = code, textContent = "CODE - Name")
    const subjectSelect = document.getElementById('subjectName');
    const selectedOpt = subjectSelect?.options[subjectSelect.selectedIndex];
    const subjectJson = selectedOpt?.dataset?.subjectData ? JSON.parse(selectedOpt.dataset.subjectData) : null;
    const realName = subjectJson?.name || id.subjectName || id.subjectCode;

    // Module is on a button (textContent, not .value)
    const moduleBtn = document.getElementById('module');
    const realModule = id.component || (moduleBtn?.textContent?.trim() !== 'Módulo' ? moduleBtn?.textContent?.trim() : '') || id.module || '';

    // Prerequisites: look up names from DOM checkbox labels
    const prereqItems = (id.prerequisites || []).map(code => {
        const labelSpan = document.getElementById(`prereq_${code}`)?.parentElement?.querySelector('span');
        const name = labelSpan?.textContent?.trim();
        return name ? `${code} — ${name}` : code;
    });

    // ── helpers ──────────────────────────────────────────────
    const esc = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const na  = (s) => esc(s) || '<em style="color:#bbb;">—</em>';
    const empty = (msg) => `<p class="bk-empty">${msg}</p>`;
    const bkTable = (head, rows) => `
        <div class="bk-table-wrap">
        <table class="bk-table">
            <thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
            <tbody>${rows.join('')}</tbody>
        </table></div>`;
    const bkTr = (cells) => `<tr>${cells.map((c,i)=>`<td>${c||'<span class="bk-nd">—</span>'}</td>`).join('')}</tr>`;

    // ── chapter / section builders ───────────────────────────
    const chapters = [
        'Identificación', 'Profesores', 'Presentación',
        'Competencias', 'Metodología y Contenidos',
        'Sistema de Evaluación', 'Cronograma', 'Referencias'
    ];
    // Note: chapter titles above are for TOC display only
    const ch = (n, title) => `
        <h1 id="bk-ch${n}" class="bk-chapter">
            <span class="bk-ch-dot"></span>${title}
        </h1>`;
    const sc = (chN, scN, title) => `
        <h2 id="bk-sc${chN}-${scN}" class="bk-section">
            ${title}
        </h2>`;

    // ── data ─────────────────────────────────────────────────
    const pres      = formData.presentation || {};
    const comp      = formData.competencies || {};
    const matrix    = comp.matrix || [];
    const ras       = comp.learningOutcomes || [];
    const topics    = formData.methodology || [];
    const cronograma= formData.cronograma || [];
    const rotaciones= formData.rotaciones || [];
    const teachers  = formData.teachers || [];
    const evalTable = formData.evaluationTable || [];

    // ── TOC ──────────────────────────────────────────────────
    const tocSections = {
        1: [['1','Datos de identificación'],['2','Prerrequisitos']],
        2: [['1','Coordinador'],['2','Cuerpo docente']],
        3: [['1','Información de presentación']],
        4: [['1','Matriz de competencias']],
        5: [['1','Temas y estrategias']],
        6: [['1','Proceso de evaluación'],['2','Tabla de calificación']],
        7: [['1','Distribución de temas'],['2','Distribución de rotaciones'],['3','Malla horaria']],
        8: [['1','Lista de referencias']]
    };
    let tocHtml = `<nav class="bk-toc"><div class="bk-toc-title">Tabla de Contenidos</div><ol class="bk-toc-list">`;
    chapters.forEach((title, i) => {
        const n = i + 1;
        tocHtml += `<li><a href="#" onclick="document.getElementById('bk-ch${n}').scrollIntoView({behavior:'smooth',block:'start'});return false;">${title}</a>`;
        if (tocSections[n]) {
            tocHtml += `<ul>`;
            tocSections[n].forEach(([sn, st]) => {
                tocHtml += `<li><a href="#" onclick="document.getElementById('bk-sc${n}-${sn}').scrollIntoView({behavior:'smooth',block:'start'});return false;">${st}</a></li>`;
            });
            tocHtml += `</ul>`;
        }
        tocHtml += `</li>`;
    });
    tocHtml += `</ol></nav>`;

    // ── CSS ──────────────────────────────────────────────────
    const css = `
    <style>
    #previewContent {
        font-family: Georgia,'Book Antiqua',Palatino,serif;
        font-size: 14px; line-height: 1.75; color: #222;
        background: #fff; padding: 0;
    }
    .bk-layout { display: flex; gap: 0; align-items: flex-start; }
    .bk-sidebar {
        width: 220px; flex-shrink: 0; position: sticky; top: 0;
        max-height: 90vh; overflow-y: auto;
        border-right: 1px solid #e0e6ef; padding: 20px 0;
        font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    }
    .bk-main { flex: 1; min-width: 0; padding: 28px 36px 40px; }
    .bk-toc { }
    .bk-toc-title {
        font-size: 11px; font-weight: 700; text-transform: uppercase;
        letter-spacing: 0.1em; color: #7a8ba0; padding: 0 18px 10px; border-bottom: 1px solid #e0e6ef;
    }
    .bk-toc-list { list-style: none; margin: 0; padding: 8px 0; }
    .bk-toc-list > li { padding: 0; }
    .bk-toc-list > li > a {
        display: block; padding: 5px 18px; font-size: 13px; font-weight: 600;
        color: #2c3e50; text-decoration: none;
    }
    .bk-toc-list > li > a:hover { color: #1D5FA6; background: #f0f4fb; }
    .bk-toc-list ul { list-style: none; margin: 0; padding: 0; }
    .bk-toc-list ul li a {
        display: block; padding: 3px 18px 3px 32px; font-size: 12px;
        color: #5a7080; text-decoration: none;
    }
    .bk-toc-list ul li a:hover { color: #1D5FA6; }

    /* Cover */
    .bk-cover {
        text-align: center; padding: 32px 0 28px;
        border-bottom: 3px double #1D5FA6; margin-bottom: 32px;
    }
    .bk-cover-inst {
        font-family: -apple-system,sans-serif; font-size: 11px;
        text-transform: uppercase; letter-spacing: 0.15em; color: #8a9bb0; margin-bottom: 6px;
    }
    .bk-cover-title {
        font-family: -apple-system,sans-serif; font-size: 26px; font-weight: 700;
        color: #1D5FA6; margin: 0 0 10px;
    }
    .bk-cover-meta {
        font-size: 13px; color: #555; font-family: -apple-system,sans-serif;
    }
    .bk-cover-badge {
        display: inline-block; background: #eef3fa; border: 1px solid #c2d4ee;
        border-radius: 20px; padding: 3px 14px; font-size: 12px; color: #3a5a8c;
        margin: 8px 4px 0; font-family: -apple-system,sans-serif;
    }

    /* Chapters & Sections */
    .bk-chapter {
        font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        font-size: 22px; font-weight: 700; color: #1a2a3a;
        border-bottom: 2px solid #1D5FA6; padding-bottom: 8px;
        margin: 36px 0 18px; display: flex; align-items: baseline; gap: 12px;
    }
    .bk-ch-dot {
        display: inline-block; width: 10px; height: 10px; background: #1D5FA6;
        border-radius: 50%; flex-shrink: 0; margin-right: 10px; margin-bottom: 2px;
    }
    .bk-section {
        font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        font-size: 16px; font-weight: 600; color: #2c4a6a;
        border-left: 4px solid #1D5FA6; padding-left: 12px;
        margin: 26px 0 12px;
    }
    .bk-subsection {
        font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        font-size: 13px; font-weight: 700; color: #3a5a7a; text-transform: uppercase;
        letter-spacing: 0.05em; margin: 16px 0 8px; padding-bottom: 4px;
        border-bottom: 1px dashed #dce6ef;
    }

    /* Data rows */
    .bk-dl { display: grid; grid-template-columns: 200px 1fr; gap: 4px 12px; margin: 8px 0 16px; font-size: 13px; }
    .bk-dt { font-weight: 600; color: #4a6070; }
    .bk-dd { color: #333; }
    .bk-nd { color: #bbb; font-style: italic; }

    /* Tables */
    .bk-table-wrap { overflow-x: auto; margin: 10px 0 18px; border-radius: 6px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
    .bk-table { width: 100%; border-collapse: collapse; font-size: 12.5px; font-family: -apple-system,sans-serif; }
    .bk-table thead tr { background: #1D5FA6; color: white; }
    .bk-table th { padding: 10px 12px; text-align: left; font-weight: 600; }
    .bk-table td { padding: 8px 12px; border-bottom: 1px solid #e8eef4; vertical-align: top; }
    .bk-table tbody tr:nth-child(even) { background: #f7fafd; }
    .bk-table tbody tr:hover { background: #eef4ff; }
    .bk-table td:first-child { font-weight: 500; }

    /* Misc */
    .bk-empty { color: #bbb; font-style: italic; font-size: 12px; margin: 6px 0; }
    .bk-text { white-space: pre-wrap; margin: 6px 0 14px; padding: 12px 16px; background: #f9fbfd; border-left: 3px solid #c2d4ee; border-radius: 0 6px 6px 0; font-size: 13px; }
    .bk-callout { background: #f0f4fb; border-left: 4px solid #1D5FA6; padding: 10px 14px; border-radius: 0 6px 6px 0; margin: 8px 0; font-size: 12.5px; font-family: -apple-system,sans-serif; }
    .bk-ol { margin: 4px 0 12px; padding-left: 22px; }
    .bk-ol li { margin-bottom: 4px; font-size: 13px; }
    .bk-footer { margin-top: 48px; padding-top: 14px; border-top: 1px solid #dce6ef; text-align: center; font-size: 11px; color: #aaa; font-family: -apple-system,sans-serif; }
    </style>`;

    // ── CONTENT ──────────────────────────────────────────────
    let body = '';

    // Cover
    body += `<div class="bk-cover">
        <div class="bk-cover-inst">Universidad del Cauca · Facultad de Ciencias de la Salud · Programa de Medicina</div>
        <div class="bk-cover-title">${esc(realName)}</div>
        <div class="bk-cover-meta">Microcurrículo de asignatura · ${new Date().toLocaleDateString('es-CO',{year:'numeric',month:'long',day:'numeric'})}</div>
        <div>
            ${id.subjectCode ? `<span class="bk-cover-badge">Código: ${esc(id.subjectCode)}</span>` : ''}
            ${id.semester   ? `<span class="bk-cover-badge">Semestre ${esc(id.semester)}</span>` : ''}
            ${id.credits    ? `<span class="bk-cover-badge">${esc(id.credits)} créditos</span>` : ''}
            ${(id.directTeachingHours||id.hoursPerWeek) ? `<span class="bk-cover-badge">${esc(id.directTeachingHours||id.hoursPerWeek)} h/semana</span>` : ''}
            ${id.component  ? `<span class="bk-cover-badge">${esc(id.component)}</span>` : ''}
        </div>
    </div>`;

    // ── Ch.1 Identificación ───────────────────────────────────
    body += ch(1,'Identificación');
    body += sc(1,1,'Datos de identificación');
    body += `<div class="bk-dl">
        <span class="bk-dt">Nombre</span><span class="bk-dd">${na(realName)}</span>
        <span class="bk-dt">Código</span><span class="bk-dd">${na(id.subjectCode)}</span>
        <span class="bk-dt">Semestre</span><span class="bk-dd">${na(id.semester)}</span>
        <span class="bk-dt">Créditos académicos</span><span class="bk-dd">${na(id.credits)}</span>
        <span class="bk-dt">Horas docencia directa/sem</span><span class="bk-dd">${na(id.directTeachingHours||id.hoursPerWeek)}</span>
        <span class="bk-dt">Módulo / Componente</span><span class="bk-dd">${na(realModule)}</span>
    </div>`;
    body += sc(1,2,'Prerrequisitos');
    body += prereqItems.length
        ? `<ul class="bk-ol">${prereqItems.map(p=>`<li>${esc(p)}</li>`).join('')}</ul>`
        : empty('Sin prerrequisitos definidos.');

    // ── Ch.2 Profesores ───────────────────────────────────────
    body += ch(2,'Profesores');
    body += sc(2,1,'Coordinador');
    if (id.coordinator) {
        body += `<div class="bk-dl">
            <span class="bk-dt">Nombre</span><span class="bk-dd">${na(id.coordinator)}</span>
            <span class="bk-dt">Email</span><span class="bk-dd">${na(id.coordinatorEmail)}</span>
            <span class="bk-dt">Perfil profesional</span><span class="bk-dd">${na(id.coordinatorArea)}</span>
        </div>`;
    } else { body += empty('Sin coordinador registrado.'); }
    body += sc(2,2,'Cuerpo docente');
    if (teachers.length) {
        body += bkTable(['Nombre','Email','Perfil profesional'],
            teachers.map(t => bkTr([esc(t.name), esc(t.email), esc(t.area)])));
    } else { body += empty('Sin docentes registrados.'); }

    // ── Ch.3 Presentación ─────────────────────────────────────
    body += ch(3,'Presentación');
    body += sc(3,1,'Información de presentación');
    const presFields3 = [
        ['Presentación de la Asignatura', pres.departmentMission],
        ['Objetivo General', pres.generalObjectives],
        ['Objetivos Específicos', pres.specificObjectives],
        ['Justificación de la Asignatura', pres.justification],
        ['Descripción General de la Asignatura', pres.generalDescription],
        ['Espacios de Asesorías', pres.advisorySpaces],
    ];
    const hasPres = presFields3.some(([,v]) => v);
    if (hasPres) {
        presFields3.forEach(([label, val]) => {
            if (val) body += `<p class="bk-subsection">${label}</p><div class="bk-text">${esc(val)}</div>`;
        });
    } else {
        body += empty('Sin información de presentación registrada.');
    }

    // ── Ch.4 Competencias ─────────────────────────────────────
    body += ch(4,'Competencias');
    body += sc(4,1,'Matriz de competencias');
    if (matrix.length) {
        body += bkTable(
            ['#','Módulo','Competencia','Resultado de Aprendizaje','Estrategia Metodológica','Estrategia Evaluativa','Indicador'],
            matrix.map((m,i) => bkTr([i+1, esc(m.modulo), esc(m.competencia), esc(m.ra), esc(m.estrategiaMet), esc(m.estrategiaEval), esc(m.indicador)]))
        );
    } else { body += empty('Sin filas en la matriz de competencias.'); }

    // ── Ch.5 Metodología y Contenidos ────────────────────────
    body += ch(5,'Metodología y Contenidos');
    body += sc(5,1,'Temas y estrategias pedagógicas');
    if (topics.length) {
        body += bkTable(['#','Tema / Unidad','Estrategia(s)','Trabajo independiente','Bibliografía'],
            topics.map((t,i) => {
                const strats = Array.isArray(t.strategies) ? t.strategies.join(', ') : (t.strategy||'');
                return bkTr([i+1, esc(t.topic), esc(strats), esc(t.independent), esc(t.bibliography)]);
            }));
    } else { body += empty('Sin temas registrados en Metodología y Contenidos.'); }

    // ── Ch.6 Sistema de Evaluación ────────────────────────────
    body += ch(6,'Sistema de Evaluación');
    body += sc(6,1,'Proceso de evaluación');
    if (formData.evaluation?.diagnostic) {
        body += `<div class="bk-text">${esc(formData.evaluation.diagnostic)}</div>`;
    } else { body += empty('Sin descripción del proceso evaluativo.'); }
    if (formData.evaluation?.details) {
        body += `<p class="bk-subsection">Detalles adicionales</p><div class="bk-text">${esc(formData.evaluation.details)}</div>`;
    }
    body += sc(6,2,'Tabla de calificación');
    if (evalTable.length) {
        const rows = [];
        evalTable.forEach(tiempo => {
            tiempo.momentos.forEach(momento => {
                momento.tipos.forEach((tipo, tipoIdx) => {
                    const showT = tiempo.momentos[0] === momento && tipoIdx === 0;
                    const showM = tipoIdx === 0;
                    rows.push(bkTr([
                        showT ? `<strong>${esc(tiempo.nombre)}</strong><br><span style="color:#1D5FA6;font-weight:700;">${esc(tiempo.porcentaje)}</span>` : '',
                        showM ? `${esc(momento.nombre)}<br><span style="color:#555;font-size:11px;">${esc(momento.porcentaje)}</span>` : '',
                        esc(tipo.nombre),
                        `<strong style="color:#1D5FA6;">${esc(tipo.porcentaje)||'—'}</strong>`
                    ]));
                });
            });
        });
        body += bkTable(['Tiempo evaluativo','Momento','Tipo de evaluación','%'], rows);
        const total = evalTable.reduce((s,t)=>s+(parseFloat(t.porcentaje)||0),0);
        const ok = Math.abs(total-100)<0.01;
        body += `<div class="bk-callout" style="background:${ok?'#f0faf4':'#fff5f5'};border-color:${ok?'#2d9e5a':'#e04444'};">
            <strong>Total nota final:</strong> ${total}%
            ${ok ? '&nbsp; ✓ Correcto' : '&nbsp; ⚠️ No suma 100%'}
        </div>`;
    } else { body += empty('Sin tabla de evaluación configurada.'); }

    // ── Ch.7 Cronograma ───────────────────────────────────────
    body += ch(7,'Cronograma');
    body += sc(7,1,'Distribución semanal de temas');
    if (topics.length) {
        body += bkTable(['Tema / Unidad','Semana','Fecha(s)','Observaciones'],
            topics.map(t => {
                const e = cronograma.find(c=>c.topicId===t.id)||{};
                return bkTr([esc(t.topic), esc(e.semana), esc(e.fechas), esc(e.observaciones)]);
            }));
    } else { body += empty('Sin temas para distribuir.'); }
    body += sc(7,2,'Distribución semanal de rotaciones');
    if (rotaciones.length) {
        body += bkTable(['Rotación / Servicio','Semana','Fecha(s)','Observaciones'],
            rotaciones.map(r => bkTr([esc(r.servicio), esc(r.semana), esc(r.fechas), esc(r.observaciones)])));
    } else { body += `<div class="bk-callout">Esta asignatura no registra rotaciones clínicas o por servicios.</div>`; }
    body += sc(7,3,'Malla horaria semanal');
    body += `<div class="bk-callout">La distribución horaria detallada (día y franja) se coordina con la Oficina de Registro Académico. Consultar la malla en la pestaña <em>Cronograma</em>.</div>`;

    // ── Ch.8 Referencias ──────────────────────────────────────
    body += ch(8,'Referencias');
    body += sc(8,1,'Lista de referencias');
    const refs = topics
        .map(t => (t.bibliography || '').trim())
        .filter(b => b.length > 0);
    const uniqueRefs = [...new Set(refs)];
    if (uniqueRefs.length) {
        body += `<ol class="bk-ol bk-refs">`;
        uniqueRefs.forEach(ref => {
            body += `<li style="margin-bottom:8px; padding-bottom:8px; border-bottom:1px dashed #e8eef4;">${esc(ref)}</li>`;
        });
        body += `</ol>`;
    } else {
        body += empty('Sin referencias bibliográficas registradas en los temas.');
    }

    // Footer
    body += `<div class="bk-footer">
        Microcurrículo generado con <strong>MicroApp</strong> · Universidad del Cauca · ${new Date().toLocaleDateString('es-CO',{year:'numeric',month:'long',day:'numeric'})}
    </div>`;

    container.innerHTML = `${css}<div class="bk-layout">
        <div class="bk-sidebar">${tocHtml}</div>
        <div class="bk-main">${body}</div>
    </div>`;
}

// ── Import from Markdown ─────────────────────────────────
function importMarkdown() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown,.Rmd,.txt';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => parseAndLoadMarkdown(ev.target.result);
        reader.readAsText(file, 'UTF-8');
    };
    input.click();
}

function parseAndLoadMarkdown(content) {
    // Utility: parse all non-separator rows of a Markdown table
    function parseMdTable(block) {
        return block.split('\n')
            .map(l => l.trim())
            .filter(l => l.startsWith('|') && !l.match(/^\|[\s|:-]+\|$/))
            .map(line => line.split('|').slice(1, -1)
                .map(c => c.trim().replace(/\*\*/g, '').replace(/_([^_]+)_/g, '$1'))
            );
    }

    // Extract block under a heading (## N.M …) — stops at next ##/# heading OR --- separator
    function getBlock(src, headingPrefix) {
        const esc = headingPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(esc + '[^\n]*\n([\\s\\S]*?)(?=\n#{1,3} |\n---\n|\n---$|$)', 'i');
        const m = src.match(re);
        return m ? m[1].trim() : '';
    }

    // Extract full content of a chapter (# N. or # N ) — stops at next # heading
    function getChapterBlock(src, chNum) {
        const re = new RegExp(`(?:^|\n)# ${chNum}[. ][^\n]*\n([\\s\\S]*?)(?=\n# \\d|$)`, 'i');
        const m = src.match(re);
        return m ? m[1].trim() : '';
    }

    // Parse ### subsections within a block (handles ### directly, no ## wrapper needed)
    function parseH3(block) {
        const result = {};
        ('\n' + block).split(/\n### /).slice(1).forEach(chunk => {
            const title = chunk.split('\n')[0].trim();
            const body = chunk.split('\n').slice(1).join('\n').trim();
            result[title] = body;
        });
        return result;
    }

    const newData = {
        identification: {},
        teachers: [],
        presentation: {},
        competencies: { matrix: [] },
        methodology: [],
        cronograma: [],
        rotaciones: [],
        mallaHoraria: {},
        evaluationTable: null,
        evaluation: {},
        schedule: []
    };
    const importLog = [];

    // ── 1.1 Datos de identificación ──
    const sec11 = getBlock(content, '## 1.1');
    parseMdTable(sec11).slice(1).forEach(([field, value]) => {
        if (!field || !value || value === '—') return;
        if (/nombre/i.test(field))              newData.identification.subjectName = value;
        else if (/código|codigo/i.test(field))  newData.identification.subjectCode = value;
        else if (/semestre/i.test(field))       newData.identification.semester = value;
        else if (/créditos|creditos/i.test(field)) newData.identification.credits = value;
        else if (/horas/i.test(field)) {
            newData.identification.directTeachingHours = value;
            newData.identification.hoursPerWeek = value;
        }
        else if (/módulo|modulo|componente/i.test(field)) {
            newData.identification.component = value;
            newData.identification.module = value;
        }
    });
    // Fallback 1: YAML front matter (codigo: "MED-001")
    if (!newData.identification.subjectCode) {
        const m = content.match(/^codigo:\s*["']?([A-Z]+-\d+)["']?/im);
        if (m) newData.identification.subjectCode = m[1];
    }
    // Fallback 2: blockquote or inline "Código: MED-001"
    if (!newData.identification.subjectCode) {
        const m = content.match(/[Cc]ódigo:\s*["']?([A-Z]+-\d+)["']?/);
        if (m) newData.identification.subjectCode = m[1];
    }
    // Fallback 3: YAML title for name if not yet found
    if (!newData.identification.subjectName) {
        const m = content.match(/^title:\s*["']?(.+?)["']?\s*$/im);
        if (m) newData.identification.subjectName = m[1].trim();
    }
    if (newData.identification.subjectCode) importLog.push('✓ Identificación');

    // ── 1.2 Prerrequisitos ──
    const sec12 = getBlock(content, '## 1.2');
    // "Ninguno." / "Ninguno" / "Sin prerrequisitos" → empty array
    const prereqText = sec12.trim().toLowerCase();
    if (prereqText && !prereqText.startsWith('ninguno') && !prereqText.startsWith('sin prerreq') && !prereqText.startsWith('_sin')) {
        newData.identification.prerequisites = sec12.split('\n')
            .filter(l => /^\d+\./.test(l.trim()))
            .map(l => { const m = l.replace(/^\d+\.\s*/, '').trim().match(/^([A-Z]+-\d+)/); return m ? m[1] : ''; })
            .filter(Boolean);
        if (newData.identification.prerequisites.length) importLog.push('✓ Prerrequisitos');
    } else {
        newData.identification.prerequisites = [];
    }

    // ── 2.1 Coordinador ──
    const sec21 = getBlock(content, '## 2.1');
    parseMdTable(sec21).slice(1).forEach(([field, value]) => {
        if (!field || !value || value === '—') return;
        if (/nombre/i.test(field))       newData.identification.coordinator = value;
        else if (/email/i.test(field))   newData.identification.coordinatorEmail = value;
        else if (/perfil/i.test(field))  newData.identification.coordinatorArea = value;
    });
    if (newData.identification.coordinator) importLog.push('✓ Coordinador');

    // ── 2.2 Cuerpo docente ──
    const sec22 = getBlock(content, '## 2.2');
    parseMdTable(sec22).slice(1).forEach((row, i) => {
        if (row[0] && row[0] !== '—') {
            newData.teachers.push({ id: Date.now() + i, name: row[0], email: row[1] || '', area: row[2] || '' });
        }
    });
    if (newData.teachers.length) importLog.push(`✓ Profesores (${newData.teachers.length})`);

    // ── 3. Presentación ──
    // Try ## 3.1 first; if absent, fall back to the full # 3. chapter block
    // (some files use ### directly under # 3. without an ## 3.1 subheading)
    let sec31 = getBlock(content, '## 3.1');
    if (!sec31) sec31 = getChapterBlock(content, 3);

    const presMap = {
        'Presentación de la Asignatura': 'departmentMission',
        'Objetivo General': 'generalObjectives',
        'Objetivos Específicos': 'specificObjectives',
        'Justificación de la Asignatura': 'justification',
        'Descripción General de la Asignatura': 'generalDescription',
        'Espacios de Asesorías': 'advisorySpaces',
    };
    Object.entries(parseH3(sec31)).forEach(([title, body]) => {
        const field = presMap[title];
        if (field && body && !body.startsWith('_')) newData.presentation[field] = body;
    });
    if (Object.keys(newData.presentation).length) importLog.push('✓ Presentación');

    // ── 4.1 Matriz de competencias ──
    const sec41 = getBlock(content, '## 4.1');
    parseMdTable(sec41).slice(1).forEach((row, i) => {
        if (row.length >= 2 && row[1] && row[1] !== '—') {
            newData.competencies.matrix.push({
                id: Date.now() + i + 500,
                modulo: row[1] || '', competencia: row[2] || '',
                ra: row[3] || '', estrategiaMet: row[4] || '',
                estrategiaEval: row[5] || '', indicador: row[6] || ''
            });
        }
    });
    if (newData.competencies.matrix.length) importLog.push(`✓ Competencias (${newData.competencies.matrix.length})`);

    // ── 5.1 Temas y estrategias ──
    const sec51 = getBlock(content, '## 5.1');
    parseMdTable(sec51).slice(1).forEach((row, i) => {
        if (row.length >= 2 && row[1] && row[1] !== '—') {
            const tid = Date.now() + i + 1000;
            newData.methodology.push({
                id: tid, topic: row[1] || '',
                strategy: row[2] || '',
                strategies: (row[2] || '').split(',').map(s => s.trim()).filter(Boolean),
                independent: row[3] || '',
                bibliography: (row[4] && row[4] !== '—') ? row[4] : ''
            });
        }
    });
    if (newData.methodology.length) importLog.push(`✓ Temas (${newData.methodology.length})`);
    methodologyTopics = newData.methodology;

    // ── 6.1 Proceso de evaluación ──
    const sec61 = getBlock(content, '## 6.1');
    const diagText = sec61.replace(/^_.*_\s*$/gm, '').trim();
    if (diagText) { newData.evaluation.diagnostic = diagText; importLog.push('✓ Proceso evaluativo'); }

    // ── 6.2 Tabla de calificación (nested reconstruction) ──
    const sec62 = getBlock(content, '## 6.2');
    const evalRows = parseMdTable(sec62);
    if (evalRows.length > 1) {
        const tiempos = [];
        let cTiempo = null, cMomento = null;
        evalRows.slice(1).forEach(row => {
            const [c0, c1, c2, c3] = row;
            if (c0 && c0 !== '—') {
                const tm = c0.match(/^(.+?)\s*\((\d+%?)\)/);
                cTiempo = { id: Date.now() + tiempos.length * 100, nombre: tm ? tm[1].trim() : c0, porcentaje: tm ? tm[2] : '', momentos: [] };
                tiempos.push(cTiempo);
                cMomento = null;
            }
            if (c1 && c1 !== '—' && cTiempo) {
                const mm = c1.match(/^(.+?)\s*\((\d+%?)\)/);
                cMomento = { id: Date.now() + tiempos.length * 100 + (cTiempo.momentos.length + 1), nombre: mm ? mm[1].trim() : c1, porcentaje: mm ? mm[2] : '', tipos: [] };
                cTiempo.momentos.push(cMomento);
            }
            if (c2 && c2 !== '—' && cMomento) {
                cMomento.tipos.push({ id: Date.now() + Math.round(Math.random() * 9999), nombre: c2, porcentaje: (c3 && c3 !== '—') ? c3 : '' });
            }
        });
        if (tiempos.length) { newData.evaluationTable = tiempos; importLog.push(`✓ Evaluación (${tiempos.length} tiempos)`); }
    }

    // ── 7.1 Cronograma ──
    // Cronograma rows may not match methodology topic names exactly (grouped/summarized).
    // Strategy: exact match → partial match (one name contains the other) → store unlinked.
    const sec71 = getBlock(content, '## 7.1');
    parseMdTable(sec71).slice(1).forEach((row, i) => {
        if (!row[0] || row[0] === '—') return;
        const rowName = row[0].toLowerCase();
        let topic = newData.methodology.find(t => t.topic.toLowerCase() === rowName);
        if (!topic) {
            // Try: methodology topic name is substring of cronograma entry, or vice versa
            topic = newData.methodology.find(t => {
                const tl = t.topic.toLowerCase();
                return rowName.includes(tl.substring(0, Math.min(tl.length, 30))) ||
                       tl.includes(rowName.substring(0, Math.min(rowName.length, 30)));
            });
        }
        newData.cronograma.push({
            topicId: topic ? topic.id : `unlinked_${i}`,
            _importedTopic: row[0],   // keep original text for reference
            semana: row[1] || '',
            fechas: row[2] || '',
            observaciones: row[3] || ''
        });
    });
    if (newData.cronograma.length) importLog.push(`✓ Cronograma (${newData.cronograma.length} filas)`);

    // ── 7.2 Rotaciones ──
    const sec72 = getBlock(content, '## 7.2');
    parseMdTable(sec72).slice(1).forEach((row, i) => {
        // Skip placeholder text rows that leaked into the table
        if (!row[0] || row[0] === '—' || row[0].toLowerCase().startsWith('esta asignatura')) return;
        newData.rotaciones.push({ id: Date.now() + i + 2000, servicio: row[0], semana: row[1] || '', fechas: row[2] || '', observaciones: row[3] || '' });
    });
    if (newData.rotaciones.length) importLog.push('✓ Rotaciones');

    // ── Apply to form ──
    const code = newData.identification.subjectCode;
    if (!code) { showAlert('No se encontró código de asignatura en el archivo', 'error'); return; }

    // Select matching subject in dropdown to load protected fields
    const subjectSelect = document.getElementById('subjectName');
    const matchOpt = Array.from(subjectSelect.options).find(o => o.value === code);
    if (matchOpt) {
        subjectSelect.value = code;
        loadSubjectDetails(); // synchronous
    }

    // Merge imported data (overwrite editable fields, keep protected ones)
    formData.identification = { ...formData.identification, ...newData.identification };
    formData.teachers = newData.teachers;
    formData.presentation = newData.presentation;
    formData.competencies = { ...(formData.competencies || {}), matrix: newData.competencies.matrix };
    formData.methodology = newData.methodology;
    methodologyTopics = newData.methodology;
    formData.cronograma = newData.cronograma;
    formData.rotaciones = newData.rotaciones;
    formData.evaluation = newData.evaluation;
    if (newData.evaluationTable) formData.evaluationTable = newData.evaluationTable;

    loadFormFromData();
    saveLocalStorageSilent();
    updateStats();

    const notFound = !matchOpt ? ' ⚠️ Código no encontrado en el catálogo.' : '';
    showAlert(`✅ Importado: ${importLog.join(', ')}${notFound}`, 'success');
    switchTab('identification');
}

// ── Saved Versions Panel ──────────────────────────────────
async function renderSavedVersions() {
    const container = document.getElementById('savedVersionsContainer');
    if (!container) return;

    collectFormData();
    const code = formData.identification?.subjectCode;
    if (!code) {
        container.innerHTML = '<p style="color:#999;font-size:13px;">Selecciona una asignatura para ver sus versiones guardadas.</p>';
        return;
    }

    container.innerHTML = '<p style="color:#aaa;font-size:12px;font-style:italic;">Cargando versiones...</p>';

    const vKey = `microapp_versions_${code}`;
    let localVersions = [];
    try { localVersions = JSON.parse(localStorage.getItem(vKey) || '[]'); } catch(e) {}

    let allVersions = localVersions.slice().reverse();

    // Load from Supabase if available and merge
    if (supabaseReady) {
        try {
            const { data: sbVersions } = await supabase.from('microapp_data')
                .select('id, version_name, created_at, data')
                .eq('subject_code', code)
                .eq('data_type', 'version')
                .order('created_at', { ascending: false });
            if (sbVersions && sbVersions.length > 0) {
                const sbMapped = sbVersions.map(v => ({
                    id: v.id,
                    sbId: v.id,
                    name: v.version_name,
                    date: new Date(v.created_at).toLocaleString('es-CO'),
                    data: v.data,
                    source: 'supabase'
                }));
                const sbIdSet = new Set(sbMapped.map(v => v.id));
                const localOnly = allVersions.filter(v => !v.sbId || !sbIdSet.has(v.sbId));
                allVersions = [...sbMapped, ...localOnly];
                const mergedForStorage = [...sbMapped, ...localOnly].slice().reverse();
                localStorage.setItem(vKey, JSON.stringify(mergedForStorage));
            }
        } catch(e) {
            console.warn('Could not load versions from Supabase:', e);
        }
    }

    if (allVersions.length === 0) {
        container.innerHTML = '<p style="color:#999;font-size:13px;font-style:italic;">No hay versiones guardadas para esta asignatura.</p>';
        return;
    }

    const sourceLabel = s => s === 'supabase'
        ? '<span style="color:#2a9d5f;font-size:10px;margin-left:6px;">☁️ Supabase</span>'
        : '<span style="color:#aaa;font-size:10px;margin-left:6px;">💾 Local</span>';

    container.innerHTML = allVersions.map(v => {
        const idAttr = typeof v.id === 'string' ? `'${v.id}'` : v.id;
        return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#f7fafd;border:1px solid #dce6ef;border-radius:8px;margin-bottom:8px;">
            <div>
                <div style="font-weight:600;font-size:13px;color:#1D5FA6;">${v.name}</div>
                <div style="font-size:11px;color:#888;margin-top:2px;">📅 ${v.date}${sourceLabel(v.source)}</div>
            </div>
            <button onclick="restoreVersion(${idAttr})"
                style="background:#1D5FA6;color:white;border:none;padding:6px 14px;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600;">
                Restaurar
            </button>
        </div>`;
    }).join('');
}

async function restoreVersion(versionId) {
    collectFormData();
    const code = formData.identification?.subjectCode;
    if (!code) return;

    let versionData = null, versionName = '', versionDate = '';

    // Look up in localStorage first (works offline and is fast)
    const vKey = `microapp_versions_${code}`;
    let localVersions = [];
    try { localVersions = JSON.parse(localStorage.getItem(vKey) || '[]'); } catch(e) {}
    const localMatch = localVersions.find(v => v.id == versionId || v.sbId == versionId);
    if (localMatch) {
        versionData = localMatch.data;
        versionName = localMatch.name;
        versionDate = localMatch.date;
    }

    // If not found locally (e.g. after cache clear), try Supabase
    if (!versionData && supabaseReady) {
        try {
            const { data: sbV } = await supabase.from('microapp_data')
                .select('version_name, created_at, data')
                .eq('id', String(versionId)).single();
            if (sbV) {
                versionData = sbV.data;
                versionName = sbV.version_name;
                versionDate = new Date(sbV.created_at).toLocaleString('es-CO');
            }
        } catch(e) {}
    }

    if (!versionData) { showAlert('Versión no encontrada', 'error'); return; }

    const confirmed = confirm(
        `⚠️ ¿Restaurar la versión "${versionName}" (${versionDate})?\n\n` +
        `Los datos actuales se PERDERÁN si no los has guardado como versión.\n\n` +
        `¿Deseas continuar?`
    );
    if (!confirmed) return;

    formData = JSON.parse(JSON.stringify(versionData));
    loadFormFromData();
    saveLocalStorageSilent();
    showAlert(`✅ Versión "${versionName}" restaurada correctamente`, 'success');
    renderSavedVersions();
}
