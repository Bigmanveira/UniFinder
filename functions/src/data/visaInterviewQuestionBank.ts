export const VISA_INTERVIEW_QUESTION_BANK = {
  "rag_dataset_name": "CollegeReady_F1_Visa_Interview_Question_Bank_v2_2026",
  "version": "2.0",
  "last_updated": "2026-06-30",
  "purpose": "Power a realistic AI F-1 visa interview simulator for international students, especially Ghanaian applicants, using common F-1 interview themes, official visa-process requirements, and current reported screening patterns.",
  "important_disclaimer": "This dataset is for visa interview practice only. It does not provide legal advice, does not guarantee visa approval, and should not coach applicants to lie, hide information, or misrepresent facts.",
  "source_hierarchy": [
    "Official U.S. Department of State, DHS Study in the States, and EducationUSA guidance for visa process, documents, and study-abroad journey.",
    "NAFSA and university international-office guidance for preparation themes such as home ties, funding, academic plans, and interview behavior.",
    "Current F-1 interview question pattern sources for common phrasing and topical coverage.",
    "Recent reporting and immigration-law alerts for current asylum-related screening questions and unexpected realism questions."
  ],
  "interview_design_principles": [
    "Ask one question at a time.",
    "Use short, direct, consular-style wording.",
    "Prioritize study purpose, school choice, program fit, finances, documents, post-study plans, home-country ties, and consistency.",
    "Ask follow-ups based on the student's actual answer.",
    "Do not sound like a university admissions officer.",
    "Do not ask only generic questions like 'Tell me about yourself.'",
    "Do not guarantee visa approval.",
    "Do not coach dishonesty.",
    "Use the asylum-related questions carefully and neutrally."
  ],
  "categories": [
    {
      "category_id": "study_purpose",
      "category_label": "Study Purpose",
      "description": "Questions that test whether the applicant has a genuine academic reason for going to the United States.",
      "questions": [
        {
          "id": "study_purpose_001",
          "question": "Why do you want to study in the United States?",
          "intent": "Assess whether the applicant has a genuine academic reason for choosing the U.S.",
          "follow_ups": [
            "Why not study this program in Ghana?",
            "Why did you choose the U.S. instead of the UK, Canada, or another country?",
            "What makes the U.S. a better option for your field?"
          ],
          "good_answer_signals": [
            "Explains academic and professional reasons clearly.",
            "Mentions curriculum, practical learning, research opportunities, industry exposure, or program quality.",
            "Connects the U.S. study plan to long-term goals."
          ],
          "red_flags": [
            "Main reason is to live in the U.S.",
            "Main reason is to work in the U.S.",
            "Answer is vague, memorized, or purely about lifestyle.",
            "Cannot explain why the U.S. is needed for this program."
          ]
        },
        {
          "id": "study_purpose_002",
          "question": "What is the purpose of your trip to the United States?",
          "intent": "Confirm the applicant understands the visa purpose and can state it clearly.",
          "follow_ups": [
            "What degree are you going for?",
            "What school will you attend?",
            "When does your program start?"
          ],
          "good_answer_signals": [
            "States temporary academic purpose clearly.",
            "Names school, program, and degree level.",
            "Does not over-explain."
          ],
          "red_flags": [
            "Mentions work before study.",
            "Cannot name the school or program.",
            "Sounds unsure about visa purpose."
          ]
        },
        {
          "id": "study_purpose_003",
          "question": "Why do you want to continue your education now?",
          "intent": "Assess timing, motivation, and academic progression.",
          "follow_ups": [
            "What have you been doing since your last degree?",
            "Why is this the right time for this program?",
            "How does this next degree fit your career plan?"
          ],
          "good_answer_signals": [
            "Explains timing logically.",
            "Connects previous education or work to the new program.",
            "Shows the applicant has thought through the decision."
          ],
          "red_flags": [
            "Unexplained academic or work gap.",
            "No clear reason for the timing.",
            "The program seems random or unrelated."
          ]
        },
        {
          "id": "study_purpose_004",
          "question": "Why canâ€™t you continue this education in your home country?",
          "intent": "Test whether the applicant can justify international study without disrespecting home-country options.",
          "follow_ups": [
            "Are there similar programs in Ghana?",
            "What specific gap does the U.S. program fill?",
            "How will the U.S. experience improve your future career?"
          ],
          "good_answer_signals": [
            "Gives a respectful comparison.",
            "Mentions specific curriculum, facilities, specialization, research, or practical exposure.",
            "Avoids saying Ghana has no value."
          ],
          "red_flags": [
            "Dismisses home country completely.",
            "Cannot identify any specific benefit of the U.S. program.",
            "Sounds like the real goal is relocation."
          ]
        }
      ]
    },
    {
      "category_id": "school_choice",
      "category_label": "School Choice",
      "description": "Questions about why the student selected a particular university and whether they researched it properly.",
      "questions": [
        {
          "id": "school_choice_001",
          "question": "Which university will you attend?",
          "intent": "Confirm the applicant knows the school and has a real admission.",
          "follow_ups": [
            "Where is the university located?",
            "Is it public or private?",
            "What do you know about the university?"
          ],
          "good_answer_signals": [
            "Names the university confidently.",
            "Knows the city and state.",
            "Can describe the school briefly."
          ],
          "red_flags": [
            "Cannot pronounce or name the university.",
            "Does not know the location.",
            "Seems unfamiliar with the institution."
          ]
        },
        {
          "id": "school_choice_002",
          "question": "Why did you choose this university?",
          "intent": "Test whether the school choice is researched and academically motivated.",
          "follow_ups": [
            "What specific thing attracted you to this school?",
            "What other schools did you consider?",
            "Why did you choose this one over the others?"
          ],
          "good_answer_signals": [
            "Mentions curriculum, affordability, faculty, facilities, assistantship, location, accreditation, or program fit.",
            "Compares the school logically with other options.",
            "Gives specific reasons, not generic praise."
          ],
          "red_flags": [
            "Because my friend is there.",
            "Because the school accepted me.",
            "Because it is cheap, without more explanation.",
            "Cannot explain the choice."
          ]
        },
        {
          "id": "school_choice_003",
          "question": "How did you find this university?",
          "intent": "Check whether the school search process is credible.",
          "follow_ups": [
            "Did anyone help you apply?",
            "Did you use an agent?",
            "What sources did you use to compare schools?"
          ],
          "good_answer_signals": [
            "Mentions official school website, EducationUSA, professors, alumni, rankings, advisors, or personal research.",
            "Can explain the selection process.",
            "Shows ownership of the decision."
          ],
          "red_flags": [
            "An agent chose everything.",
            "The applicant did not research the school.",
            "Cannot explain how the school was selected."
          ]
        },
        {
          "id": "school_choice_004",
          "question": "How many universities did you apply to?",
          "intent": "Assess seriousness and consistency of the application process.",
          "follow_ups": [
            "Which schools admitted you?",
            "Which schools rejected you?",
            "Why did you choose this university among your options?"
          ],
          "good_answer_signals": [
            "Provides a consistent list.",
            "Understands admission outcomes.",
            "Explains final decision logically."
          ],
          "red_flags": [
            "Cannot remember the schools.",
            "Numbers conflict with documents or DS-160.",
            "Applied randomly without a plan."
          ]
        },
        {
          "id": "school_choice_005",
          "question": "Did you receive admission from any other universities?",
          "intent": "Understand alternatives and decision-making.",
          "follow_ups": [
            "Why not attend those schools?",
            "Were any of them cheaper?",
            "Did any offer scholarships?"
          ],
          "good_answer_signals": [
            "Gives clear comparison.",
            "Mentions academic and financial reasons.",
            "Answers consistently with admission documents."
          ],
          "red_flags": [
            "Contradictory answer.",
            "No clear reason for final choice.",
            "Claims admission without evidence."
          ]
        }
      ]
    },
    {
      "category_id": "program_fit",
      "category_label": "Program Fit",
      "description": "Questions that test whether the applicant understands their degree, major, curriculum, and academic/career fit.",
      "questions": [
        {
          "id": "program_fit_001",
          "question": "What will you study in the United States?",
          "intent": "Confirm the applicant knows the exact program.",
          "follow_ups": [
            "What is your major?",
            "How long is the program?",
            "What degree will you receive?"
          ],
          "good_answer_signals": [
            "Names the exact program.",
            "Knows the degree level.",
            "Can describe the field simply."
          ],
          "red_flags": [
            "Cannot name the program.",
            "Confuses major and degree level.",
            "Gives a vague answer."
          ]
        },
        {
          "id": "program_fit_002",
          "question": "Why did you choose this program?",
          "intent": "Evaluate academic motivation and program fit.",
          "follow_ups": [
            "How does it connect to your previous studies?",
            "How does it support your future career?",
            "Which courses interest you most?"
          ],
          "good_answer_signals": [
            "Connects program to past education, work, or future goals.",
            "Mentions specific courses, skills, or outcomes.",
            "Shows the program was not chosen randomly."
          ],
          "red_flags": [
            "Only chose it because it may lead to jobs in the U.S.",
            "Program is unrelated with no explanation.",
            "Cannot explain the curriculum."
          ]
        },
        {
          "id": "program_fit_003",
          "question": "How is this program related to your previous education or work experience?",
          "intent": "Check academic continuity and readiness.",
          "follow_ups": [
            "Your previous degree was different. Why this change?",
            "What skills do you already have for this program?",
            "How will you handle the transition?"
          ],
          "good_answer_signals": [
            "Explains the connection clearly.",
            "Shows preparation for the new field.",
            "Provides a believable academic/career bridge."
          ],
          "red_flags": [
            "No connection at all.",
            "Program appears to be a migration pathway.",
            "Cannot explain the change of field."
          ]
        },
        {
          "id": "program_fit_004",
          "question": "What courses are you most interested in taking?",
          "intent": "Test whether the applicant reviewed the curriculum.",
          "follow_ups": [
            "Why are those courses important to you?",
            "How will those courses help your career in Ghana?",
            "Did you review the course catalog?"
          ],
          "good_answer_signals": [
            "Mentions one to three specific courses.",
            "Explains why they matter.",
            "Connects courses to future career."
          ],
          "red_flags": [
            "Does not know any courses.",
            "Only gives general interest.",
            "Sounds memorized but cannot explain."
          ]
        },
        {
          "id": "program_fit_005",
          "question": "What is your academic background?",
          "intent": "Confirm academic eligibility and consistency.",
          "follow_ups": [
            "Where did you complete your last degree?",
            "What was your GPA or class standing?",
            "What was your final project, thesis, or research about?"
          ],
          "good_answer_signals": [
            "Gives accurate academic history.",
            "Explains academic record confidently.",
            "Connects background to intended study."
          ],
          "red_flags": [
            "Inconsistent dates.",
            "Cannot explain academic performance.",
            "Cannot discuss previous study."
          ]
        }
      ]
    },
    {
      "category_id": "finances_and_sponsorship",
      "category_label": "Finances and Sponsorship",
      "description": "Questions about whether the applicant can credibly fund their education and living expenses.",
      "questions": [
        {
          "id": "finances_001",
          "question": "Who is paying for your education?",
          "intent": "Determine whether the applicant has credible financial support.",
          "follow_ups": [
            "What is your sponsorâ€™s relationship to you?",
            "What does your sponsor do?",
            "Why is your sponsor willing to pay for your studies?"
          ],
          "good_answer_signals": [
            "Names sponsor clearly.",
            "Explains relationship naturally.",
            "Shows sponsor has credible income, savings, scholarship, assistantship, or loan support."
          ],
          "red_flags": [
            "Sponsor relationship is unclear.",
            "Sponsor income does not match cost.",
            "Applicant cannot explain funding source."
          ]
        },
        {
          "id": "finances_002",
          "question": "What does your sponsor do for a living?",
          "intent": "Assess sponsorâ€™s capacity to fund the education.",
          "follow_ups": [
            "How long has your sponsor been doing that work?",
            "Does your sponsor have other dependents?",
            "What evidence do you have of your sponsorâ€™s income?"
          ],
          "good_answer_signals": [
            "Clear sponsor occupation or business.",
            "Consistent with financial documents.",
            "Shows sustainable funding."
          ],
          "red_flags": [
            "Cannot explain sponsorâ€™s work.",
            "Sponsor profile does not support the cost.",
            "Bank balance appears sudden or unexplained."
          ]
        },
        {
          "id": "finances_003",
          "question": "How much is your tuition and total cost for the first year?",
          "intent": "Check whether the applicant understands school costs.",
          "follow_ups": [
            "What amount is listed on your I-20?",
            "How much is tuition?",
            "How much is estimated for living expenses?"
          ],
          "good_answer_signals": [
            "Knows I-20 cost estimate.",
            "Can separate tuition from living expenses.",
            "Can explain how costs will be covered."
          ],
          "red_flags": [
            "Does not know the cost.",
            "Cost differs significantly from I-20.",
            "Funding is below required amount."
          ]
        },
        {
          "id": "finances_004",
          "question": "Do you have a scholarship, assistantship, or tuition discount?",
          "intent": "Verify institutional funding and affordability.",
          "follow_ups": [
            "How much is it worth?",
            "Is it renewable?",
            "What costs remain after the award?"
          ],
          "good_answer_signals": [
            "Can state award amount.",
            "Understands remaining balance.",
            "Has documentation."
          ],
          "red_flags": [
            "Claims scholarship without proof.",
            "Does not know amount.",
            "Confuses admission with scholarship."
          ]
        },
        {
          "id": "finances_005",
          "question": "Can you explain the funds in your bank statement?",
          "intent": "Detect weak, borrowed, or unexplained financial evidence.",
          "follow_ups": [
            "Where did the money come from?",
            "How long has it been in the account?",
            "Is this savings, salary, business income, loan, or family support?"
          ],
          "good_answer_signals": [
            "Explains source of funds clearly.",
            "Matches sponsor profile.",
            "Shows funds are available for education."
          ],
          "red_flags": [
            "Large unexplained deposits.",
            "Borrowed money presented as savings.",
            "Contradicts sponsor occupation."
          ]
        },
        {
          "id": "finances_006",
          "question": "Do you plan to work while studying?",
          "intent": "Check whether the applicant understands that study is the primary purpose and does not rely on unauthorized work.",
          "follow_ups": [
            "Will you depend on work to pay tuition?",
            "What do you know about student work rules?",
            "How will you pay if you do not get campus work?"
          ],
          "good_answer_signals": [
            "Does not depend on U.S. employment to pay core expenses.",
            "Understands study is the primary purpose.",
            "Mentions authorized campus work only if appropriate."
          ],
          "red_flags": [
            "Plans to work full-time.",
            "Needs U.S. job to pay tuition.",
            "Focuses more on work than study."
          ]
        }
      ]
    },
    {
      "category_id": "documents_and_process",
      "category_label": "Documents and Visa Process",
      "description": "Questions about I-20, SEVIS, DS-160, appointment, program start date, and visa documents.",
      "questions": [
        {
          "id": "documents_001",
          "question": "Can I see your I-20?",
          "intent": "Verify admission, SEVIS record, program details, and estimated costs.",
          "follow_ups": [
            "Is your name correct on the I-20?",
            "What is your SEVIS ID?",
            "What is your program start date?"
          ],
          "good_answer_signals": [
            "Has signed I-20.",
            "Knows basic I-20 details.",
            "Details match school and DS-160."
          ],
          "red_flags": [
            "No I-20.",
            "Unsigned or incorrect I-20.",
            "Cannot explain program or cost on I-20."
          ]
        },
        {
          "id": "documents_002",
          "question": "Have you paid your SEVIS fee?",
          "intent": "Confirm the applicant completed the SEVIS I-901 payment step.",
          "follow_ups": [
            "Do you have the SEVIS I-901 receipt?",
            "When did you pay it?",
            "Does the SEVIS ID match your I-20?"
          ],
          "good_answer_signals": [
            "Has SEVIS I-901 receipt.",
            "Understands it is tied to the I-20 SEVIS ID.",
            "Documents are consistent."
          ],
          "red_flags": [
            "Does not know what SEVIS is.",
            "No receipt.",
            "Mismatched SEVIS ID."
          ]
        },
        {
          "id": "documents_003",
          "question": "When is your program start date?",
          "intent": "Check readiness, timeline, and consistency with I-20.",
          "follow_ups": [
            "When do you plan to travel?",
            "Will you arrive before orientation?",
            "Why are you applying at this time?"
          ],
          "good_answer_signals": [
            "Start date matches I-20.",
            "Travel plan is realistic.",
            "Understands arrival timeline."
          ],
          "red_flags": [
            "Timeline does not match I-20.",
            "Plans to arrive too late.",
            "Does not know start date."
          ]
        },
        {
          "id": "documents_004",
          "question": "Have you completed your DS-160?",
          "intent": "Confirm the nonimmigrant visa application was submitted.",
          "follow_ups": [
            "Did you bring your DS-160 confirmation page?",
            "Which embassy or consulate did you select?",
            "Are the details consistent with your passport and I-20?"
          ],
          "good_answer_signals": [
            "Has DS-160 confirmation page.",
            "Details match passport and I-20.",
            "Understands DS-160 is tied to this visa application."
          ],
          "red_flags": [
            "No confirmation page.",
            "Wrong interview location.",
            "Inconsistent information."
          ]
        },
        {
          "id": "documents_005",
          "question": "What documents did you bring for your interview?",
          "intent": "Assess preparation and document awareness.",
          "follow_ups": [
            "Do you have your passport?",
            "Do you have your admission letter?",
            "Do you have financial documents?"
          ],
          "good_answer_signals": [
            "Mentions passport, I-20, DS-160 confirmation, SEVIS receipt, appointment confirmation, admission letter, and financial evidence.",
            "Documents are organized.",
            "Applicant knows what each document proves."
          ],
          "red_flags": [
            "Missing essential documents.",
            "Does not know what documents mean.",
            "Documents conflict with answers."
          ]
        }
      ]
    },
    {
      "category_id": "post_study_plans_and_home_ties",
      "category_label": "Post-Study Plans and Home-Country Ties",
      "description": "Questions that evaluate temporary intent, return plans, and whether the degree has a clear home-country purpose.",
      "questions": [
        {
          "id": "home_ties_001",
          "question": "What do you plan to do after graduation?",
          "intent": "Evaluate nonimmigrant intent and career logic.",
          "follow_ups": [
            "Do you plan to return to Ghana?",
            "Where do you want to work after graduation?",
            "How will this degree help you back home?"
          ],
          "good_answer_signals": [
            "Clear post-study plan.",
            "Connects degree to home-country opportunities.",
            "Does not sound like permanent relocation is the main goal."
          ],
          "red_flags": [
            "I want to stay in America permanently.",
            "I have no plans yet.",
            "I will see what happens."
          ]
        },
        {
          "id": "home_ties_002",
          "question": "Why will you return to Ghana after your studies?",
          "intent": "Assess home ties and future intent.",
          "follow_ups": [
            "What family ties do you have in Ghana?",
            "What career opportunities exist for you in Ghana?",
            "Do you have business, professional, or family responsibilities in Ghana?"
          ],
          "good_answer_signals": [
            "Specific family, career, business, social, or professional ties.",
            "Realistic Ghana-based career goal.",
            "Confident temporary study plan."
          ],
          "red_flags": [
            "No clear reason to return.",
            "Avoids the question.",
            "Mentions fear of returning without addressing legal implications."
          ]
        },
        {
          "id": "home_ties_003",
          "question": "How will this degree benefit your career in Ghana?",
          "intent": "Check whether U.S. education has a home-country purpose.",
          "follow_ups": [
            "What companies or industries in Ghana need this skill?",
            "What role do you want after graduation?",
            "How is this field growing in Ghana?"
          ],
          "good_answer_signals": [
            "Names relevant industry or career path.",
            "Shows practical value of degree.",
            "Connects program to Ghanaâ€™s needs."
          ],
          "red_flags": [
            "Only mentions U.S. job market.",
            "Cannot explain home-country relevance.",
            "Gives vague career goals."
          ]
        },
        {
          "id": "home_ties_004",
          "question": "Do you have relatives in the United States?",
          "intent": "Check family ties and consistency with DS-160.",
          "follow_ups": [
            "What is their immigration status?",
            "Will you live with them?",
            "Did they help you choose the school?"
          ],
          "good_answer_signals": [
            "Honest and consistent answer.",
            "Explains relationship clearly.",
            "Does not hide relatives."
          ],
          "red_flags": [
            "Contradicts DS-160.",
            "Appears to hide close relatives.",
            "U.S. relatives are the main reason for school choice."
          ]
        },
        {
          "id": "home_ties_005",
          "question": "Do you plan to apply for OPT after graduation?",
          "intent": "Check whether the applicant understands OPT as temporary practical training without making it the main reason for study.",
          "follow_ups": [
            "How does OPT relate to your field?",
            "What will you do after OPT?",
            "Is your plan dependent on staying permanently?"
          ],
          "good_answer_signals": [
            "Understands OPT as temporary practical training.",
            "Connects OPT to academic field.",
            "Still has clear post-study or home-country plan."
          ],
          "red_flags": [
            "OPT is the main reason for studying.",
            "Plans depend entirely on staying in the U.S.",
            "No plan after OPT."
          ]
        }
      ]
    },
    {
      "category_id": "travel_history_and_refusals",
      "category_label": "Travel History and Previous Refusals",
      "description": "Questions about past travel, previous visa refusals, and consistency of immigration history.",
      "questions": [
        {
          "id": "travel_001",
          "question": "Have you traveled outside Ghana before?",
          "intent": "Understand travel history and compliance behavior.",
          "follow_ups": [
            "Which countries have you visited?",
            "How long did you stay?",
            "Did you return on time?"
          ],
          "good_answer_signals": [
            "Honest answer.",
            "Clear dates and purpose.",
            "Shows compliance with previous travel."
          ],
          "red_flags": [
            "Contradicts passport history.",
            "Overstays or unexplained travel.",
            "Hides prior travel."
          ]
        },
        {
          "id": "travel_002",
          "question": "Have you ever been refused a U.S. visa?",
          "intent": "Check honesty and prior application history.",
          "follow_ups": [
            "When were you refused?",
            "What visa type was it?",
            "What has changed since then?"
          ],
          "good_answer_signals": [
            "Honest disclosure.",
            "Can explain what changed.",
            "Does not blame the officer."
          ],
          "red_flags": [
            "Denies a refusal that appears in records.",
            "Nothing changed since refusal.",
            "Gives emotional or inconsistent answer."
          ]
        },
        {
          "id": "travel_003",
          "question": "Have you applied for any other countryâ€™s visa recently?",
          "intent": "Understand broader migration or study pattern.",
          "follow_ups": [
            "What was the outcome?",
            "Why did you choose the U.S. instead?",
            "Did you apply to schools in those countries?"
          ],
          "good_answer_signals": [
            "Consistent study plan.",
            "Clear reason for choosing U.S.",
            "Honest about applications."
          ],
          "red_flags": [
            "Appears desperate to leave Ghana by any means.",
            "Cannot explain country choice.",
            "Gives contradictory visa history."
          ]
        }
      ]
    },
    {
      "category_id": "ghana_specific_context",
      "category_label": "Ghana-Specific Applicant Context",
      "description": "Questions tailored for Ghanaian students, focusing on local education, funding credibility, sponsor relationship, and Ghana-based career plans.",
      "questions": [
        {
          "id": "ghana_001",
          "question": "What are you currently doing in Ghana?",
          "intent": "Understand current occupation, study status, or gap.",
          "follow_ups": [
            "Are you working or studying?",
            "How long have you been doing that?",
            "Why are you leaving now for studies?"
          ],
          "good_answer_signals": [
            "Clear current status.",
            "Logical timeline.",
            "Study plan fits current life stage."
          ],
          "red_flags": [
            "Unexplained unemployment.",
            "Timeline gaps.",
            "Cannot explain current activity."
          ]
        },
        {
          "id": "ghana_002",
          "question": "Where did you complete your previous education?",
          "intent": "Verify academic history in Ghana.",
          "follow_ups": [
            "What qualification did you receive?",
            "What year did you complete it?",
            "How does it qualify you for this program?"
          ],
          "good_answer_signals": [
            "Clear institution and qualification.",
            "Consistent dates.",
            "Understands academic progression."
          ],
          "red_flags": [
            "Dates inconsistent.",
            "Qualification unclear.",
            "Cannot explain academic path."
          ]
        },
        {
          "id": "ghana_003",
          "question": "What job opportunities will this degree create for you in Ghana?",
          "intent": "Test return plan and career practicality.",
          "follow_ups": [
            "Which companies or sectors in Ghana need this skill?",
            "Do you already have work experience in this area?",
            "What role do you want after graduation?"
          ],
          "good_answer_signals": [
            "Names Ghana-relevant sector.",
            "Shows realistic employment plan.",
            "Connects degree to local demand."
          ],
          "red_flags": [
            "Only talks about U.S. jobs.",
            "No Ghana-based career plan.",
            "Cannot name relevant local opportunities."
          ]
        },
        {
          "id": "ghana_004",
          "question": "Why should your sponsor invest this amount in your education?",
          "intent": "Test whether the sponsorship makes family and economic sense.",
          "follow_ups": [
            "How will this benefit you and your family?",
            "Has your sponsor supported your education before?",
            "Does your sponsor have the financial capacity?"
          ],
          "good_answer_signals": [
            "Explains family support naturally.",
            "Sponsor relationship is credible.",
            "Funding is realistic."
          ],
          "red_flags": [
            "Sponsor seems random.",
            "No clear relationship.",
            "Financial support seems unrealistic."
          ]
        },
        {
          "id": "ghana_005",
          "question": "Why is this degree important for your career in Ghana right now?",
          "intent": "Assess whether the applicant has a timely, Ghana-relevant reason for U.S. study.",
          "follow_ups": [
            "What problem in Ghana do you want to help solve?",
            "What industry do you want to work in after graduation?",
            "How will this program give you skills you cannot easily get now?"
          ],
          "good_answer_signals": [
            "Specific Ghana-based career reasoning.",
            "Clear industry or professional goal.",
            "Degree fits local opportunity."
          ],
          "red_flags": [
            "Only mentions leaving Ghana.",
            "No career plan.",
            "Cannot explain value of degree."
          ]
        }
      ]
    },
    {
      "category_id": "city_and_life_awareness",
      "category_label": "City, Campus, and Life Awareness",
      "description": "Unexpected but realistic questions that test whether the student genuinely researched the city, school environment, and arrival plan.",
      "questions": [
        {
          "id": "city_001",
          "question": "What do you know about the city where your school is located?",
          "intent": "Check whether the applicant researched the destination beyond the school name.",
          "follow_ups": [
            "What is the weather like there?",
            "How will you get from the airport to campus?",
            "Where do students usually live?"
          ],
          "good_answer_signals": [
            "Basic knowledge of city and state.",
            "Realistic arrival plan.",
            "Knows campus or housing basics."
          ],
          "red_flags": [
            "Does not know the city.",
            "Thinks school is in the wrong state.",
            "No arrival awareness."
          ]
        },
        {
          "id": "city_002",
          "question": "What would you do on a Saturday night in your university city?",
          "intent": "Ask an unexpected question to test natural communication and genuine awareness of student life.",
          "follow_ups": [
            "Do you know any safe student activities there?",
            "Have you checked campus events?",
            "Do you know anyone in that city?"
          ],
          "good_answer_signals": [
            "Natural, realistic answer.",
            "Mentions campus events, studying, student organizations, church, mosque, community, sports, or safe local activities.",
            "Does not sound memorized."
          ],
          "red_flags": [
            "Robotic answer.",
            "No knowledge of location.",
            "Overemphasis on partying or work."
          ]
        },
        {
          "id": "city_003",
          "question": "Where will you live when you arrive?",
          "intent": "Assess practical preparation.",
          "follow_ups": [
            "Have you applied for housing?",
            "Will you live on campus or off campus?",
            "How much will housing cost?"
          ],
          "good_answer_signals": [
            "Has researched housing.",
            "Knows temporary or permanent arrival plan.",
            "Costs align with I-20 or budget."
          ],
          "red_flags": [
            "No housing plan.",
            "Plans to live with someone not disclosed.",
            "Unrealistic cost expectations."
          ]
        }
      ]
    },
    {
      "category_id": "technical_or_field_specific_questions",
      "category_label": "Technical or Field-Specific Questions",
      "description": "Adaptive questions for graduate, STEM, research, or specialized applicants.",
      "questions": [
        {
          "id": "field_001",
          "question": "Can you explain your intended field of study in simple terms?",
          "intent": "Test whether the applicant genuinely understands the field.",
          "follow_ups": [
            "What problem does this field solve?",
            "Why are you interested in this area?",
            "How have you prepared for it?"
          ],
          "good_answer_signals": [
            "Simple explanation.",
            "Shows genuine understanding.",
            "Connects field to prior learning or career."
          ],
          "red_flags": [
            "Cannot explain field.",
            "Uses buzzwords without understanding.",
            "Seems coached."
          ]
        },
        {
          "id": "field_002",
          "question": "Tell me about a project, paper, or work experience related to your program.",
          "intent": "Check academic authenticity and readiness.",
          "follow_ups": [
            "What was your role?",
            "What tools or methods did you use?",
            "What did you learn?"
          ],
          "good_answer_signals": [
            "Specific project details.",
            "Can explain own contribution.",
            "Connects experience to future program."
          ],
          "red_flags": [
            "Cannot explain listed experience.",
            "Exaggerated resume claims.",
            "Generic answer."
          ]
        },
        {
          "id": "field_003",
          "question": "What specific skill do you expect to gain from this program?",
          "intent": "Check academic purpose and career relevance.",
          "follow_ups": [
            "How will you use that skill after graduation?",
            "Can you learn that skill in Ghana?",
            "Why is this university strong in that area?"
          ],
          "good_answer_signals": [
            "Specific, practical skill.",
            "Connects skill to home-country plan.",
            "Shows program research."
          ],
          "red_flags": [
            "Only says 'better job'.",
            "Cannot name a skill.",
            "Only focuses on U.S. salary."
          ]
        }
      ]
    },
    {
      "category_id": "asylum_related_screening",
      "category_label": "Asylum-Related Screening",
      "description": "Current reported nonimmigrant visa screening questions related to past harm, mistreatment, and fear of return. Use carefully and neutrally.",
      "usage_policy": "Use in advanced mode, full-length realism mode, or current-policy mode. Do not use to coach dishonesty. If the applicant answers yes, pause normal coaching and recommend qualified immigration legal advice.",
      "questions": [
        {
          "id": "asylum_001",
          "question": "Have you experienced harm or mistreatment in your country of nationality or last habitual residence?",
          "intent": "Screen whether the applicant may have facts that resemble a potential asylum claim, which may conflict with temporary nonimmigrant intent.",
          "follow_ups": [
            "Can you briefly explain what happened?",
            "Did this affect your decision to study in the United States?",
            "Does this change your plan to return after your studies?"
          ],
          "good_answer_signals": [
            "Honest and direct answer.",
            "Answer is consistent with the applicantâ€™s stated temporary study purpose.",
            "Applicant does not use the F-1 visa as a substitute for another immigration pathway."
          ],
          "red_flags": [
            "Applicant says they cannot return home but is applying for a temporary nonimmigrant visa.",
            "Applicant gives an answer that conflicts with stated post-study return plan.",
            "Applicant refuses to answer or gives evasive responses.",
            "Applicant appears to be using F-1 mainly as a way to enter the U.S. for protection rather than study."
          ],
          "safety_instruction": "Do not suggest that the applicant should lie or hide facts. If the applicant indicates past harm or mistreatment, advise speaking with a qualified immigration attorney before the real interview."
        },
        {
          "id": "asylum_002",
          "question": "Do you fear harm or mistreatment in returning to your country of nationality or permanent residence?",
          "intent": "Assess whether the applicantâ€™s stated fear of return conflicts with the temporary intent required for most nonimmigrant visa categories, including F-1.",
          "follow_ups": [
            "Why do you feel that way?",
            "How does that affect your plan after graduation?",
            "What ties do you still have in your home country?"
          ],
          "good_answer_signals": [
            "Honest answer.",
            "Clear explanation of post-study plans.",
            "Consistent temporary-study intent if the applicant does not fear return."
          ],
          "red_flags": [
            "Applicant says they fear returning and has no realistic return plan.",
            "Applicant says they intend to remain in the U.S. permanently.",
            "Applicant contradicts DS-160, earlier answers, or stated home ties.",
            "Applicant gives a rehearsed answer without understanding the question."
          ],
          "safety_instruction": "If the applicant answers yes, do not tell them how to hide it. Explain that this may be a serious issue for a nonimmigrant visa interview and recommend qualified legal advice."
        }
      ]
    },
    {
      "category_id": "integrity_and_consistency",
      "category_label": "Integrity and Consistency",
      "description": "Questions that test whether the applicantâ€™s story is coherent, honest, natural, and consistent with documents.",
      "questions": [
        {
          "id": "integrity_001",
          "question": "Can you briefly summarize your study plan?",
          "intent": "Test whether the whole story is coherent.",
          "follow_ups": [
            "Why this school?",
            "Why this program?",
            "Who will pay?",
            "What will you do after graduation?"
          ],
          "good_answer_signals": [
            "Short, coherent story.",
            "Consistent with documents.",
            "Natural tone."
          ],
          "red_flags": [
            "Over-rehearsed speech.",
            "Contradictions.",
            "Too long and unfocused."
          ]
        },
        {
          "id": "integrity_002",
          "question": "Your answer sounds different from what is on your DS-160. Can you explain?",
          "intent": "Stress-test consistency between oral answers and application data.",
          "follow_ups": [
            "Which answer is correct?",
            "Was there a mistake on the form?",
            "Who completed your DS-160?"
          ],
          "good_answer_signals": [
            "Calm clarification.",
            "Honest explanation.",
            "No attempt to hide mistakes."
          ],
          "red_flags": [
            "Panic.",
            "Blames agent for everything.",
            "Cannot explain own application."
          ]
        },
        {
          "id": "integrity_003",
          "question": "Is there anything else you want me to know about your application?",
          "intent": "Give applicant a chance to clarify important context.",
          "follow_ups": [
            "Why is that important?",
            "Do you have documentation for that?",
            "How does that affect your study plan?"
          ],
          "good_answer_signals": [
            "Brief useful clarification.",
            "Does not ramble.",
            "Addresses possible concern."
          ],
          "red_flags": [
            "Introduces new contradictions.",
            "Overexplains irrelevant details.",
            "Adds facts that conflict with prior answers."
          ]
        }
      ]
    }
  ]
} as const;

