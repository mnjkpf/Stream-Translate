package com.streamtranslate.backend.savewords;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.result.MockMvcResultMatchers;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.streamtranslate.backend.TestcontainersConfiguration;
import com.streamtranslate.backend.auth.JwtService;
import com.streamtranslate.backend.savewords.dto.WordRequest;
import com.streamtranslate.backend.savewords.dto.WordResponse;
import com.streamtranslate.backend.user.UserRepository;
import com.streamtranslate.backend.user.Users;

// Перевіряє межу авторизації навколо /words: без токена все закрито (401), а IDOR неможливий —
// findByIdAndUser_Id (WordService) не дає одному юзеру торкнутись чужого слова, навіть знаючи його id (404).
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class WordControllerSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JwtService jwtService;

    @Test
    void withoutTokenWordsIsUnauthorized() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.get("/words"))
                .andExpect(MockMvcResultMatchers.status().isUnauthorized());
    }

    @Test
    void foreignWordIdIsNotFoundForOtherUser() throws Exception {
        Users owner = persistUser("owner-sub-security");
        Users stranger = persistUser("stranger-sub-security");
        String ownerAuth = "Bearer " + jwtService.issueAccess(owner);
        String strangerAuth = "Bearer " + jwtService.issueAccess(stranger);

        WordRequest wordRequest = new WordRequest(
                "table", "table", "noun", "стіл", null, "en", "uk", null, null);

        String created = mockMvc.perform(MockMvcRequestBuilders.post("/words")
                        .header("Authorization", ownerAuth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(wordRequest)))
                .andExpect(MockMvcResultMatchers.status().isCreated())
                .andReturn().getResponse().getContentAsString();

        WordResponse ownerWord = objectMapper.readValue(created, WordResponse.class);

        mockMvc.perform(MockMvcRequestBuilders.put("/words/" + ownerWord.id())
                        .header("Authorization", strangerAuth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(wordRequest)))
                .andExpect(MockMvcResultMatchers.status().isNotFound());

        mockMvc.perform(MockMvcRequestBuilders.delete("/words/" + ownerWord.id())
                        .header("Authorization", strangerAuth))
                .andExpect(MockMvcResultMatchers.status().isNotFound());
    }

    private Users persistUser(String googleSub) {
        Users user = new Users();
        user.setGoogleSub(googleSub);
        user.setEmail(googleSub + "@example.com");
        user.setDisplayName(googleSub);
        return userRepository.save(user);
    }
}
