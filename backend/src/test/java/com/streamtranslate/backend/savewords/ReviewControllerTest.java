package com.streamtranslate.backend.savewords;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.result.MockMvcResultMatchers;

import tools.jackson.databind.json.JsonMapper;
import com.streamtranslate.backend.TestcontainersConfiguration;
import com.streamtranslate.backend.auth.JwtService;
import com.streamtranslate.backend.savewords.dto.WordRequest;
import com.streamtranslate.backend.savewords.dto.WordResponse;
import com.streamtranslate.backend.user.UserRepository;
import com.streamtranslate.backend.user.Users;

// POST /review/{id}: той самий IDOR-захист, що й WordControllerSecurityTest — findByIdAndUser_Id
// не дає одному юзеру оцінити чужу картку, навіть знаючи її id (404, а не 403 чи 200).
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class ReviewControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JsonMapper objectMapper;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JwtService jwtService;

    @Test
    void foreignCardIsNotFoundForOtherUser() throws Exception {
        Users owner = persistUser("owner-sub-review");
        Users stranger = persistUser("stranger-sub-review");
        String ownerAuth = "Bearer " + jwtService.issueAccess(owner);
        String strangerAuth = "Bearer " + jwtService.issueAccess(stranger);

        String wordId = createWord(ownerAuth, "table", "table");

        mockMvc.perform(MockMvcRequestBuilders.post("/review/" + wordId)
                        .header("Authorization", strangerAuth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"grade\":\"good\"}"))
                .andExpect(MockMvcResultMatchers.status().isNotFound());
    }

    @Test
    void unknownGradeInBodyIsBadRequest() throws Exception {
        Users owner = persistUser("owner-sub-review-2");
        String auth = "Bearer " + jwtService.issueAccess(owner);

        String wordId = createWord(auth, "cup", "cup");

        mockMvc.perform(MockMvcRequestBuilders.post("/review/" + wordId)
                        .header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"grade\":\"gud\"}"))
                .andExpect(MockMvcResultMatchers.status().isBadRequest());
    }

    // Пастка кроку B1: applyRequest у WordService.create не має чіпати SRS-поля при
    // повторному upsert-і того самого слова, інакше кожне "⭐ Зберегти" скидало б прогрес.
    @Test
    void savingWordAgainDoesNotResetSrsProgress() throws Exception {
        Users owner = persistUser("owner-sub-review-progress");
        String auth = "Bearer " + jwtService.issueAccess(owner);
        WordRequest wordRequest = new WordRequest(
                "run", "run", "verb", "бігти", null, "en", "uk", null, null);

        String created = mockMvc.perform(MockMvcRequestBuilders.post("/words")
                        .header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(wordRequest)))
                .andExpect(MockMvcResultMatchers.status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String wordId = objectMapper.readValue(created, WordResponse.class).id().toString();

        String reviewed = mockMvc.perform(MockMvcRequestBuilders.post("/review/" + wordId)
                        .header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"grade\":\"good\"}"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andReturn().getResponse().getContentAsString();
        WordResponse afterReview = objectMapper.readValue(reviewed, WordResponse.class);
        assertThat(afterReview.srsLevel()).isEqualTo(1);

        String savedAgain = mockMvc.perform(MockMvcRequestBuilders.post("/words")
                        .header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(wordRequest)))
                .andExpect(MockMvcResultMatchers.status().isCreated())
                .andReturn().getResponse().getContentAsString();
        WordResponse afterResave = objectMapper.readValue(savedAgain, WordResponse.class);

        assertThat(afterResave.srsLevel()).isEqualTo(afterReview.srsLevel());
        assertThat(afterResave.dueAt()).isEqualTo(afterReview.dueAt());
    }

    private String createWord(String auth, String text, String lemma) throws Exception {
        WordRequest wordRequest = new WordRequest(
                text, lemma, "noun", "переклад", null, "en", "uk", null, null);

        String created = mockMvc.perform(MockMvcRequestBuilders.post("/words")
                        .header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(wordRequest)))
                .andExpect(MockMvcResultMatchers.status().isCreated())
                .andReturn().getResponse().getContentAsString();

        return objectMapper.readValue(created, WordResponse.class).id().toString();
    }

    private Users persistUser(String googleSub) {
        Users user = new Users();
        user.setGoogleSub(googleSub);
        user.setEmail(googleSub + "@example.com");
        user.setDisplayName(googleSub);
        return userRepository.save(user);
    }
}
