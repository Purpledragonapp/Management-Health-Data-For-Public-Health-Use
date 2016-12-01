function getPatientName(pt) {
	if (pt.name) {
		var names = pt.name.map(function(name) {
			return name.given.join(" ") + " " + name.family.join(" ");
		});
		return names.join(" / ");
	} else {
		return "anonymous";
	}
}

function getMedicationName(medCodings) {
	var coding = medCodings.find(function(c) {
		return c.system == "http://www.nlm.nih.gov/research/umls/rxnorm";
	});
	return coding && coding.display || "Unnamed Medication(TM)";
}

function displayPatient(pt) {
	document.getElementById("patient_name").innerHTML = getPatientName(pt);
}

function displayMedication(medCodings) {
	var med_list = document.getElementById("med_list");
	med_list.innerHTML += "<li> " + getMedicationName(medCodings) + "</li>";
}

var demo = {
	serviceUrl: "https://fhir-open-api-dstu2.smarthealthit.org",
	patientId: "1137192"
};

var smart = FHIR.client(demo),
	pt = smart.patient;

smart.patient.read().then(function(pt) {
	displayPatient(pt);
});

smart.patient.api.fetchAllWithReferences({type: "MedicationOrder"},["MedicationOrder.medicationReference"]).then(function(results, refs) {
	results.forEach(function(prescription) {
		if (prescription.medicationCodeableConcept) {
			displayMedication(prescription.medicationCodeableConcept.coding);
		} else if (prescription.medicationReference) {
			var med = refs(prescription, prescription.medicationReference);
			displayMedication(med && med.code.coding || []);
		}
	});
});